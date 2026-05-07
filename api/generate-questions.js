import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_QUESTIONS_FOR_TESTS = 5;
const MODEL = "gpt-4.1-mini";

function createPrompt({ institution, questionCount, specialty }) {
  return `
Você é um gerador de questões inéditas para treino de residência médica.

Tarefa:
Gerar ${questionCount} questões de múltipla escolha inéditas, em português do Brasil, inspiradas no estilo de ${institution}, sobre ${specialty}.

Regras obrigatórias:
- Não copiar questões reais.
- Não dizer que a questão é oficial.
- Todas as questões devem ser inéditas e geradas por IA.
- O exame deve ser "Residência Médica".
- Cada questão deve ter apenas uma alternativa correta.
- As alternativas devem ser plausíveis.
- O comentário explicativo deve ter entre 240 e 400 caracteres.
- Retorne apenas JSON válido.
- Não use markdown.
- Não escreva nada fora do JSON.

Formato exato esperado:
{
  "questions": [
    {
      "id": "string-unico",
      "sourceType": "ai_generated",
      "examType": "Residência Médica",
      "institutionStyle": "${institution}",
      "specialty": "${specialty}",
      "topic": "string",
      "subtopic": "string",
      "difficulty": "fácil|média|difícil",
      "statement": "texto da questão",
      "options": {
        "A": "texto alternativa A",
        "B": "texto alternativa B",
        "C": "texto alternativa C",
        "D": "texto alternativa D"
      },
      "correctAnswer": "A|B|C|D",
      "comment": "comentário explicativo entre 240 e 400 caracteres"
    }
  ]
}
`.trim();
}

function sanitizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isValidOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return false;
  }

  const requiredKeys = ["A", "B", "C", "D"];
  return requiredKeys.every((key) => sanitizeText(options[key]).length > 0);
}

function isValidCorrectAnswer(answer) {
  return ["A", "B", "C", "D"].includes(answer);
}

function isValidDifficulty(value) {
  return ["fácil", "média", "difícil"].includes(value);
}

function validateQuestion(question, index = 0) {
  const requiredStringFields = [
    "id",
    "sourceType",
    "examType",
    "institutionStyle",
    "specialty",
    "topic",
    "subtopic",
    "statement",
    "correctAnswer",
    "comment",
  ];

  for (const field of requiredStringFields) {
    if (sanitizeText(question?.[field]).length === 0) {
      throw new Error(`Questão ${index + 1}: campo obrigatório ausente ou inválido: ${field}`);
    }
  }

  if (question.sourceType !== "ai_generated") {
    throw new Error(`Questão ${index + 1}: sourceType inválido`);
  }

  if (question.examType !== "Residência Médica") {
    throw new Error(`Questão ${index + 1}: examType inválido`);
  }

  if (!isValidDifficulty(question.difficulty)) {
    throw new Error(`Questão ${index + 1}: difficulty inválido`);
  }

  if (!isValidOptions(question.options)) {
    throw new Error(`Questão ${index + 1}: options inválidas`);
  }

  if (!isValidCorrectAnswer(question.correctAnswer)) {
    throw new Error(`Questão ${index + 1}: correctAnswer inválido`);
  }

  if (!question.options[question.correctAnswer]) {
    throw new Error(`Questão ${index + 1}: correctAnswer não corresponde às alternativas`);
  }

  const commentLength = sanitizeText(question.comment).length;
  if (commentLength < 240 || commentLength > 400) {
    throw new Error(`Questão ${index + 1}: comment fora do tamanho esperado`);
  }

  return {
    id: sanitizeText(question.id),
    sourceType: "ai_generated",
    examType: "Residência Médica",
    institutionStyle: sanitizeText(question.institutionStyle),
    specialty: sanitizeText(question.specialty),
    topic: sanitizeText(question.topic),
    subtopic: sanitizeText(question.subtopic),
    difficulty: sanitizeText(question.difficulty),
    statement: sanitizeText(question.statement),
    options: {
      A: sanitizeText(question.options.A),
      B: sanitizeText(question.options.B),
      C: sanitizeText(question.options.C),
      D: sanitizeText(question.options.D),
    },
    correctAnswer: sanitizeText(question.correctAnswer),
    comment: sanitizeText(question.comment),
  };
}

function extractJsonString(content) {
  if (typeof content !== "string") {
    throw new Error("Resposta da IA vazia ou inválida");
  }

  const trimmed = content.trim();

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Não foi possível localizar JSON válido na resposta da IA");
    }

    return trimmed.slice(start, end + 1);
  }
}

function parseAndValidateQuestions(rawContent, expectedCount) {
  const jsonString = extractJsonString(rawContent);

  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error("A IA retornou um JSON inválido");
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.questions)) {
    throw new Error("A resposta não contém o array questions");
  }

  if (parsed.questions.length === 0) {
    throw new Error("A IA não retornou nenhuma questão");
  }

  if (parsed.questions.length !== expectedCount) {
    throw new Error(
      `Quantidade de questões inválida: esperado ${expectedCount}, recebido ${parsed.questions.length}`
    );
  }

  const validatedQuestions = parsed.questions.map((question, index) =>
    validateQuestion(question, index)
  );

  return validatedQuestions;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido.",
    });
  }

  try {
    const body = req.body || {};
    const institution = sanitizeText(body.institution);
    const specialty = sanitizeText(body.specialty);
    const requestedCount = Number(body.questionCount);

    if (!institution || !specialty || !requestedCount) {
      return res.status(400).json({
        error: "Dados obrigatórios ausentes. Selecione instituição, tema e quantidade.",
      });
    }

    const safeQuestionCount = Math.min(
      Math.max(parseInt(requestedCount, 10) || 1, 1),
      MAX_QUESTIONS_FOR_TESTS
    );

    const prompt = createPrompt({
      institution,
      questionCount: safeQuestionCount,
      specialty,
    });

    const response = await client.responses.create({
      model: MODEL,
      input: prompt,
    });

    const rawContent =
      response.output_text ||
      response.output?.flatMap((item) => item.content || []).map((c) => c.text || "").join("\n") ||
      "";

    const questions = parseAndValidateQuestions(rawContent, safeQuestionCount);

    return res.status(200).json({
      success: true,
      questions,
      meta: {
        requestedCount,
        deliveredCount: questions.length,
        limitedToTestMax: requestedCount > MAX_QUESTIONS_FOR_TESTS,
      },
    });
  } catch (error) {
    console.error("Erro ao gerar questões:", error);

    const message =
      error?.message && typeof error.message === "string"
        ? error.message
        : "Não foi possível gerar o simulado agora. Tente novamente em instantes.";

    return res.status(500).json({
      error: "Não foi possível gerar o simulado agora. Tente novamente em instantes.",
      details: message,
    });
  }
}
