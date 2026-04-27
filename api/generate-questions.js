import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MAX_QUESTIONS = 5;

function getSafeQuantity(quantity) {
  const parsedQuantity = Number(quantity);

  if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
    return 1;
  }

  return Math.min(parsedQuantity, MAX_QUESTIONS);
}

function buildQuestionPrompt({
  institutionName,
  institutionStyle,
  topic,
  quantity
}) {
  return `
Você é um gerador de questões inéditas para simulados de residência médica.

Gere exatamente ${quantity} questões de múltipla escolha para treino.

Regras obrigatórias:
- Não copie questões reais.
- Não diga que a questão pertence oficialmente à instituição.
- A instituição é apenas inspiração de estilo.
- Cada questão deve ter uma única alternativa correta.
- Use exatamente 4 alternativas: A, B, C e D.
- As alternativas devem ser plausíveis.
- O comentário deve ter entre 240 e 400 caracteres.
- Retorne apenas JSON válido.
- Não inclua markdown.
- Não inclua texto fora do JSON.

Instituição de inspiração:
${institutionName}

Perfil de estilo:
${institutionStyle || "Questões clínicas objetivas, com foco em raciocínio diagnóstico e conduta."}

Tema:
${topic || "Tema livre dentro de residência médica"}

Formato obrigatório da resposta:
{
  "questions": [
    {
      "id": "ia-generated-001",
      "sourceType": "ai_generated",
      "examType": "Residência Médica",
      "institutionStyle": "${institutionName}",
      "specialty": "Nome da área médica",
      "topic": "Tema principal",
      "subtopic": "Subtema específico",
      "difficulty": "medium",
      "statement": "Enunciado da questão",
      "options": [
        { "id": "A", "text": "Alternativa A" },
        { "id": "B", "text": "Alternativa B" },
        { "id": "C", "text": "Alternativa C" },
        { "id": "D", "text": "Alternativa D" }
      ],
      "correctAnswer": "A",
      "comment": "Comentário explicativo entre 240 e 400 caracteres."
    }
  ]
}
`;
}

function normalizeQuestionsPayload(parsedContent) {
  if (Array.isArray(parsedContent)) {
    return parsedContent;
  }

  if (parsedContent && Array.isArray(parsedContent.questions)) {
    return parsedContent.questions;
  }

  throw new Error("INVALID_AI_JSON_FORMAT");
}

function validateQuestion(question, index) {
  if (!question || typeof question !== "object") {
    throw new Error(`INVALID_QUESTION_${index + 1}`);
  }

  const requiredFields = [
    "statement",
    "options",
    "correctAnswer",
    "comment"
  ];

  requiredFields.forEach(field => {
    if (!question[field]) {
      throw new Error(`MISSING_FIELD_${field.toUpperCase()}_${index + 1}`);
    }
  });

  if (!Array.isArray(question.options) || question.options.length !== 4) {
    throw new Error(`INVALID_OPTIONS_${index + 1}`);
  }

  const optionIds = question.options.map(option => option.id);
  const requiredOptionIds = ["A", "B", "C", "D"];

  const hasAllRequiredOptions = requiredOptionIds.every(id =>
    optionIds.includes(id)
  );

  if (!hasAllRequiredOptions) {
    throw new Error(`INVALID_OPTION_IDS_${index + 1}`);
  }

  if (!requiredOptionIds.includes(question.correctAnswer)) {
    throw new Error(`INVALID_CORRECT_ANSWER_${index + 1}`);
  }

  return {
    id: question.id || `ia-generated-${String(index + 1).padStart(3, "0")}`,
    sourceType: "ai_generated",
    examType: "Residência Médica",
    institutionStyle: question.institutionStyle || "Instituição de inspiração",
    specialty: question.specialty || "Residência Médica",
    topic: question.topic || "Tema livre",
    subtopic: question.subtopic || "Subtema não informado",
    difficulty: question.difficulty || "medium",
    statement: question.statement,
    options: question.options,
    correctAnswer: question.correctAnswer,
    comment: question.comment
  };
}

function validateQuestions(questions, expectedQuantity) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("NO_QUESTIONS_RETURNED");
  }

  const validQuestions = questions
    .slice(0, expectedQuantity)
    .map(validateQuestion);

  return validQuestions;
}

function getErrorResponse(error) {
  const message = String(error?.message || "");

  if (
    message.includes("insufficient_quota") ||
    message.includes("quota") ||
    message.includes("billing")
  ) {
    return {
      status: 402,
      payload: {
        error: "OPENAI_QUOTA_ERROR",
        message: "Não foi possível gerar o simulado porque a cota da API foi atingida."
      }
    };
  }

  if (
    message.includes("rate_limit") ||
    message.includes("429")
  ) {
    return {
      status: 429,
      payload: {
        error: "OPENAI_RATE_LIMIT",
        message: "Muitas solicitações foram feitas em pouco tempo. Tente novamente em instantes."
      }
    };
  }

  if (
    message.includes("INVALID_AI_JSON_FORMAT") ||
    message.includes("INVALID_QUESTION") ||
    message.includes("MISSING_FIELD") ||
    message.includes("INVALID_OPTIONS") ||
    message.includes("INVALID_OPTION_IDS") ||
    message.includes("INVALID_CORRECT_ANSWER") ||
    message.includes("NO_QUESTIONS_RETURNED")
  ) {
    return {
      status: 502,
      payload: {
        error: "INVALID_AI_RESPONSE",
        message: "A IA retornou uma resposta fora do formato esperado. Tente gerar novamente."
      }
    };
  }

  return {
    status: 500,
    payload: {
      error: "QUESTION_GENERATION_ERROR",
      message: "Não foi possível gerar as questões agora. Tente novamente em instantes."
    }
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({
      error: "METHOD_NOT_ALLOWED",
      message: "Método não permitido."
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return response.status(500).json({
      error: "MISSING_OPENAI_API_KEY",
      message: "A chave da OpenAI não foi configurada no servidor."
    });
  }

  try {
    const {
      institutionName,
      institutionStyle,
      topic,
      quantity
    } = request.body || {};

    if (!institutionName) {
      return response.status(400).json({
        error: "MISSING_INSTITUTION_NAME",
        message: "Informe a instituição de inspiração."
      });
    }

    const safeQuantity = getSafeQuantity(quantity);

    const prompt = buildQuestionPrompt({
      institutionName,
      institutionStyle,
      topic,
      quantity: safeQuantity
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "Você gera questões médicas inéditas em JSON válido. Responda somente JSON, sem markdown."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.6,
      response_format: {
        type: "json_object"
      }
    });

    const rawContent = completion?.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw new Error("NO_AI_CONTENT");
    }

    const parsedContent = JSON.parse(rawContent);
    const questionsPayload = normalizeQuestionsPayload(parsedContent);

    const questions = validateQuestions(questionsPayload, safeQuantity);

    return response.status(200).json({
      questions,
      meta: {
        requestedQuantity: Number(quantity),
        returnedQuantity: questions.length,
        maxQuestions: MAX_QUESTIONS,
        source: "ai_generated"
      }
    });
  } catch (error) {
    console.error("Erro ao gerar questões:", error);

    const { status, payload } = getErrorResponse(error);

    return response.status(status).json(payload);
  }
}
