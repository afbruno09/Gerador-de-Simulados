import OpenAI from "openai";
import fallbackQuestions from "../data/questoes.json" assert { type: "json" };

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_TEST_QUESTIONS = 5;
const DEFAULT_MODEL = "gpt-4.1-mini";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido.",
    });
  }

  const body = typeof req.body === "string" ? safeParseJSON(req.body) : req.body || {};

  const institutionStyle = sanitizeText(body.institutionStyle || body.institution || "");
  const specialty = sanitizeText(body.specialty || body.area || "");
  const topic = sanitizeText(body.topic || "Tema livre");
  const requestedCount = Number(body.amount || body.quantity || body.numberOfQuestions || 5);
  const amount = clampQuestionAmount(requestedCount);

  if (!institutionStyle) {
    return res.status(400).json({
      success: false,
      error: "Instituição não informada.",
    });
  }

  try {
    const aiQuestions = await generateQuestionsWithAI({
      institutionStyle,
      specialty,
      topic,
      amount,
    });

    const validatedQuestions = validateQuestions(aiQuestions, {
      institutionStyle,
      specialty,
      topic,
      amount,
      sourceType: "ai_generated",
    });

    if (validatedQuestions.length < amount) {
      throw new Error("A IA retornou menos questões válidas do que o solicitado.");
    }

    return res.status(200).json({
      success: true,
      source: "openai",
      questions: validatedQuestions,
      warning:
        "Simulado gerado por IA. Não oficial. Use como ferramenta complementar de estudo.",
    });
  } catch (error) {
    console.error("Erro ao gerar simulado com IA:", error);

    const fallback = getFallbackQuestions({
      institutionStyle,
      specialty,
      topic,
      amount,
    });

    if (fallback.length > 0) {
      return res.status(200).json({
        success: true,
        source: "fallback_local",
        questions: fallback,
        warning:
          "Não foi possível gerar novas questões por IA neste momento. Exibindo questões de apoio do banco local.",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Não foi possível gerar o simulado agora. Tente novamente em instantes.",
    });
  }
}

async function generateQuestionsWithAI({
  institutionStyle,
  specialty,
  topic,
  amount,
}) {
  const systemPrompt = `
Você gera simulados inéditos para treino de residência médica.

Regras obrigatórias:
- Nunca copie questões reais.
- Nunca diga que a questão é oficial.
- O estilo deve ser inspirado na instituição solicitada, sem afirmar vínculo oficial.
- Gere apenas múltipla escolha com 4 alternativas: A, B, C e D.
- Apenas 1 alternativa correta.
- As alternativas incorretas devem ser plausíveis.
- O comentário explicativo deve ter entre 240 e 400 caracteres.
- Retorne apenas JSON válido.
- Não use markdown.
- Não escreva texto fora do JSON.

Formato de saída:
{
  "questions": [
    {
      "id": "string",
      "sourceType": "ai_generated",
      "examType": "Residência Médica",
      "institutionStyle": "string",
      "specialty": "string",
      "topic": "string",
      "subtopic": "string",
      "difficulty": "fácil|média|difícil",
      "statement": "string",
      "options": {
        "A": "string",
        "B": "string",
        "C": "string",
        "D": "string"
      },
      "correctAnswer": "A|B|C|D",
      "comment": "string"
    }
  ]
}
  `.trim();

  const userPrompt = `
Gere ${amount} questões inéditas para treino de residência médica.

Instituição de inspiração: ${institutionStyle}
Especialidade/área: ${specialty || "Geral"}
Tema: ${topic}

Requisitos:
- dificuldade compatível com o estilo da instituição escolhida
- linguagem clara, objetiva e confiável
- conteúdo adequado para treino
- sem repetir enunciados
- sem repetir gabaritos de forma mecânica
- subtopic deve ser específico
  `.trim();

  const response = await openai.responses.create({
    model: DEFAULT_MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }],
      },
    ],
    temperature: 0.7,
    max_output_tokens: 5000,
  });

  const rawText = extractTextFromResponse(response);
  const parsed = safeParseJSON(rawText);

  if (!parsed || !Array.isArray(parsed.questions)) {
    throw new Error("A resposta da IA não contém o array questions em JSON válido.");
  }

  return parsed.questions;
}

function extractTextFromResponse(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const texts = [];

  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (!Array.isArray(item.content)) continue;

      for (const contentItem of item.content) {
        if (typeof contentItem.text === "string") {
          texts.push(contentItem.text);
        }
      }
    }
  }

  const combined = texts.join("\n").trim();

  if (!combined) {
    throw new Error("A IA não retornou texto utilizável.");
  }

  return combined;
}

function validateQuestions(questions, context) {
  if (!Array.isArray(questions)) {
    throw new Error("As questões retornadas não estão em formato de array.");
  }

  const normalized = questions
    .map((question, index) => normalizeQuestion(question, context, index))
    .filter(Boolean);

  if (!normalized.length) {
    throw new Error("Nenhuma questão válida foi encontrada após validação.");
  }

  return normalized.slice(0, context.amount);
}

function normalizeQuestion(question, context, index) {
  if (!question || typeof question !== "object") return null;

  const options = normalizeOptions(question.options);

  const normalized = {
    id: sanitizeText(question.id) || createQuestionId(index),
    sourceType: sanitizeText(question.sourceType) || context.sourceType,
    examType: sanitizeText(question.examType) || "Residência Médica",
    institutionStyle:
      sanitizeText(question.institutionStyle) || context.institutionStyle,
    specialty: sanitizeText(question.specialty) || context.specialty || "Geral",
    topic: sanitizeText(question.topic) || context.topic,
    subtopic: sanitizeText(question.subtopic) || context.topic || "Geral",
    difficulty: normalizeDifficulty(question.difficulty),
    statement: sanitizeText(question.statement),
    options,
    correctAnswer: normalizeCorrectAnswer(question.correctAnswer),
    comment: sanitizeText(question.comment),
  };

  if (!normalized.statement) return null;
  if (!normalized.options.A || !normalized.options.B || !normalized.options.C || !normalized.options.D) {
    return null;
  }
  if (!normalized.correctAnswer) return null;
  if (!["A", "B", "C", "D"].includes(normalized.correctAnswer)) return null;
  if (!normalized.comment) return null;

  return normalized;
}

function normalizeOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return { A: "", B: "", C: "", D: "" };
  }

  return {
    A: sanitizeText(options.A),
    B: sanitizeText(options.B),
    C: sanitizeText(options.C),
    D: sanitizeText(options.D),
  };
}

function getFallbackQuestions({
  institutionStyle,
  specialty,
  topic,
  amount,
}) {
  if (!Array.isArray(fallbackQuestions)) {
    return [];
  }

  const normalizedInstitution = normalizeCompare(institutionStyle);
  const normalizedSpecialty = normalizeCompare(specialty);
  const normalizedTopic = normalizeCompare(topic);

  let filtered = fallbackQuestions.filter((question) => {
    const qInstitution = normalizeCompare(question.institutionStyle || "");
    const qSpecialty = normalizeCompare(question.specialty || "");
    const qTopic = normalizeCompare(question.topic || "");

    const matchesInstitution = normalizedInstitution
      ? qInstitution.includes(normalizedInstitution) || normalizedInstitution.includes(qInstitution)
      : true;

    const matchesSpecialty = normalizedSpecialty
      ? qSpecialty.includes(normalizedSpecialty) || normalizedSpecialty.includes(qSpecialty)
      : true;

    const matchesTopic = normalizedTopic
      ? qTopic.includes(normalizedTopic) || normalizedTopic.includes(qTopic)
      : true;

    return matchesInstitution && matchesSpecialty && matchesTopic;
  });

  if (filtered.length < amount) {
    filtered = fallbackQuestions.filter((question) => {
      const qInstitution = normalizeCompare(question.institutionStyle || "");

      const matchesInstitution = normalizedInstitution
        ? qInstitution.includes(normalizedInstitution) || normalizedInstitution.includes(qInstitution)
        : true;

      return matchesInstitution;
    });
  }

  if (filtered.length < amount) {
    filtered = fallbackQuestions;
  }

  return shuffleArray(filtered)
    .slice(0, amount)
    .map((question, index) =>
      normalizeQuestion(
        {
          ...question,
          sourceType: "fallback_local",
        },
        {
          institutionStyle,
          specialty,
          topic,
          amount,
          sourceType: "fallback_local",
        },
        index
      )
    )
    .filter(Boolean);
}

function clampQuestionAmount(value) {
  if (!Number.isFinite(value) || value <= 0) return 5;
  return Math.min(Math.floor(value), MAX_TEST_QUESTIONS);
}

function normalizeDifficulty(value) {
  const text = normalizeCompare(value);

  if (text.includes("fac")) return "fácil";
  if (text.includes("dif")) return "difícil";
  if (text.includes("med")) return "média";
  return "média";
}

function normalizeCorrectAnswer(value) {
  const answer = sanitizeText(value).toUpperCase();
  return ["A", "B", "C", "D"].includes(answer) ? answer : "";
}

function sanitizeText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCompare(value) {
  return sanitizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function createQuestionId(index) {
  return `q_${Date.now()}_${index + 1}`;
}

function safeParseJSON(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    const possibleJson = trimmed.slice(firstBrace, lastBrace + 1);

    try {
      return JSON.parse(possibleJson);
    } catch {
      return null;
    }
  }
}

function shuffleArray(array) {
  const clone = [...array];

  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }

  return clone;
}
