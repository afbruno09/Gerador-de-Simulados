import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MODEL = "gpt-4.1-mini";
const FREE_DAILY_GENERATION_LIMIT = 2;
const FREE_MAX_QUESTIONS = 5;
const VALID_ANSWERS = ["A", "B", "C", "D"];
const VALID_DIFFICULTIES = ["fácil", "média", "difícil"];

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

function normalizeText(value) {
  return sanitizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeDifficulty(value) {
  const normalized = normalizeText(value);

  if (normalized === "facil") return "fácil";
  if (normalized === "media") return "média";
  if (normalized === "dificil") return "difícil";

  return sanitizeText(value).toLowerCase();
}

function isValidOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return false;
  }

  const requiredKeys = ["A", "B", "C", "D"];
  return requiredKeys.every((key) => sanitizeText(options[key]).length > 0);
}

function isValidCorrectAnswer(answer) {
  return VALID_ANSWERS.includes(sanitizeText(answer).toUpperCase());
}

function isValidDifficulty(value) {
  return VALID_DIFFICULTIES.includes(normalizeDifficulty(value));
}

function makeQuestionId(prefix, index) {
  return `${prefix}_${Date.now()}_${index + 1}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeQuestion(question, index = 0, fallbackMeta = {}) {
  const sourceTypeRaw = sanitizeText(question?.sourceType);
  const sourceType =
    sourceTypeRaw === "fallback_local" ? "fallback_local" : "ai_generated";

  const difficulty = normalizeDifficulty(question?.difficulty);
  const correctAnswer = sanitizeText(question?.correctAnswer).toUpperCase();

  return {
    id:
      sanitizeText(question?.id) ||
      makeQuestionId(sourceType === "fallback_local" ? "fallback" : "ai", index),
    sourceType,
    examType: sanitizeText(question?.examType) || "Residência Médica",
    institutionStyle:
      sanitizeText(question?.institutionStyle) ||
      sanitizeText(fallbackMeta?.institution) ||
      "Geral",
    specialty:
      sanitizeText(question?.specialty) ||
      sanitizeText(fallbackMeta?.specialty) ||
      "Geral",
    topic:
      sanitizeText(question?.topic) ||
      sanitizeText(fallbackMeta?.specialty) ||
      "Geral",
    subtopic:
      sanitizeText(question?.subtopic) ||
      sanitizeText(question?.topic) ||
      sanitizeText(fallbackMeta?.specialty) ||
      "Geral",
    difficulty,
    statement: sanitizeText(question?.statement),
    options: {
      A: sanitizeText(question?.options?.A),
      B: sanitizeText(question?.options?.B),
      C: sanitizeText(question?.options?.C),
      D: sanitizeText(question?.options?.D),
    },
    correctAnswer,
    comment: sanitizeText(question?.comment),
  };
}

function validateQuestion(question, index = 0, fallbackMeta = {}) {
  const normalized = normalizeQuestion(question, index, fallbackMeta);

  const requiredStringFields = [
    "id",
    "sourceType",
    "examType",
    "institutionStyle",
    "specialty",
    "topic",
    "subtopic",
    "difficulty",
    "statement",
    "correctAnswer",
    "comment",
  ];

  for (const field of requiredStringFields) {
    if (sanitizeText(normalized[field]).length === 0) {
      throw new Error(
        `Questão ${index + 1}: campo obrigatório ausente ou inválido: ${field}`
      );
    }
  }

  if (!["ai_generated", "fallback_local"].includes(normalized.sourceType)) {
    throw new Error(`Questão ${index + 1}: sourceType inválido`);
  }

  if (normalized.examType !== "Residência Médica") {
    throw new Error(`Questão ${index + 1}: examType inválido`);
  }

  if (!isValidDifficulty(normalized.difficulty)) {
    throw new Error(`Questão ${index + 1}: difficulty inválido`);
  }

  if (!isValidOptions(normalized.options)) {
    throw new Error(`Questão ${index + 1}: options inválidas`);
  }

  if (!isValidCorrectAnswer(normalized.correctAnswer)) {
    throw new Error(`Questão ${index + 1}: correctAnswer inválido`);
  }

  if (!normalized.options[normalized.correctAnswer]) {
    throw new Error(
      `Questão ${index + 1}: correctAnswer não corresponde às alternativas`
    );
  }

  const commentLength = sanitizeText(normalized.comment).length;
  if (commentLength < 120 || commentLength > 500) {
    throw new Error(`Questão ${index + 1}: comment fora do tamanho esperado`);
  }

  return {
    ...normalized,
    difficulty: normalizeDifficulty(normalized.difficulty),
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

function parseAIQuestions(rawContent, fallbackMeta = {}) {
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

  const validQuestions = [];
  const invalidQuestions = [];

  parsed.questions.forEach((question, index) => {
    try {
      validQuestions.push(validateQuestion(question, index, fallbackMeta));
    } catch (error) {
      invalidQuestions.push({
        index,
        error: error.message,
      });
    }
  });

  if (validQuestions.length === 0) {
    throw new Error("Nenhuma questão válida foi retornada pela IA");
  }

  return {
    validQuestions,
    invalidQuestions,
    totalReceived: parsed.questions.length,
  };
}

function isPremiumAccess(accessRow) {
  if (!accessRow) return false;
  if (accessRow.plan !== "premium") return false;
  if (!accessRow.premium_until) return true;

  return new Date(accessRow.premium_until).getTime() > Date.now();
}

function getStartOfTodayISOString() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

function loadFallbackQuestionsFromFile() {
  try {
    const filePath = path.join(process.cwd(), "data", "questoes.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("questoes.json não contém um array");
    }

    return parsed;
  } catch (error) {
    console.error("Erro ao carregar questoes.json:", error);
    return [];
  }
}

function shuffleArray(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function filterFallbackQuestions(allQuestions, { institution, specialty }) {
  const normalizedInstitution = normalizeText(institution);
  const normalizedSpecialty = normalizeText(specialty);

  const exactMatches = allQuestions.filter((question) => {
    const questionInstitution = normalizeText(question?.institutionStyle);
    const questionSpecialty = normalizeText(question?.specialty);
    const questionTopic = normalizeText(question?.topic);
    const questionSubtopic = normalizeText(question?.subtopic);

    const institutionMatches =
      !normalizedInstitution || questionInstitution === normalizedInstitution;

    const specialtyMatches =
      !normalizedSpecialty ||
      questionSpecialty === normalizedSpecialty ||
      questionTopic === normalizedSpecialty ||
      questionSubtopic === normalizedSpecialty;

    return institutionMatches && specialtyMatches;
  });

  if (exactMatches.length > 0) return exactMatches;

  const specialtyOnlyMatches = allQuestions.filter((question) => {
    const questionSpecialty = normalizeText(question?.specialty);
    const questionTopic = normalizeText(question?.topic);
    const questionSubtopic = normalizeText(question?.subtopic);

    return (
      questionSpecialty === normalizedSpecialty ||
      questionTopic === normalizedSpecialty ||
      questionSubtopic === normalizedSpecialty
    );
  });

  if (specialtyOnlyMatches.length > 0) return specialtyOnlyMatches;

  const institutionOnlyMatches = allQuestions.filter((question) => {
    const questionInstitution = normalizeText(question?.institutionStyle);
    return questionInstitution === normalizedInstitution;
  });

  if (institutionOnlyMatches.length > 0) return institutionOnlyMatches;

  return allQuestions;
}

function getFallbackQuestions({ institution, specialty, amount }) {
  const allQuestions = loadFallbackQuestionsFromFile();

  if (!allQuestions.length) {
    return [];
  }

  const filtered = filterFallbackQuestions(allQuestions, {
    institution,
    specialty,
  });

  const validated = [];
  const shuffled = shuffleArray(filtered);

  for (let i = 0; i < shuffled.length; i += 1) {
    if (validated.length >= amount) break;

    try {
      validated.push(
        validateQuestion(shuffled[i], i, {
          institution,
          specialty,
        })
      );
    } catch (error) {
      console.error("Questão inválida no fallback local:", error.message);
    }
  }

  return validated
    .slice(0, amount)
    .map((question) => ({ ...question, sourceType: "fallback_local" }));
}

function dedupeQuestionsByStatement(questions) {
  const seen = new Set();
  const result = [];

  for (const question of questions) {
    const key = normalizeText(question.statement);

    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(question);
  }

  return result;
}

async function generateQuestionsWithAI({ institution, specialty, questionCount }) {
  const prompt = createPrompt({
    institution,
    questionCount,
    specialty,
  });

  const response = await client.responses.create({
    model: MODEL,
    input: prompt,
  });

  const rawContent =
    response.output_text ||
    response.output
      ?.flatMap((item) => item.content || [])
      .map((contentItem) => contentItem.text || "")
      .join("\n") ||
    "";

  return parseAIQuestions(rawContent, {
    institution,
    specialty,
  });
}

async function registerGenerationLog(userId) {
  if (!userId) return;

  const { error: logError } = await supabaseAdmin.from("generation_logs").insert({
    user_id: userId,
  });

  if (logError) {
    console.error("Erro ao registrar geração:", logError);
  }
}

function getFriendlyAIErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);

  if (
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("too many requests") ||
    message.includes("insufficient_quota")
  ) {
    return {
      code: "AI_TEMPORARILY_UNAVAILABLE",
      message: "Estamos com alta demanda na geração por IA no momento. Tente novamente em instantes.",
    };
  }

  if (
    status >= 500 ||
    message.includes("server error") ||
    message.includes("bad gateway") ||
    message.includes("timeout") ||
    message.includes("gateway")
  ) {
    return {
      code: "AI_SERVER_ERROR",
      message: "A geração por IA está instável no momento. Tente novamente em alguns instantes.",
    };
  }

  return {
    code: "AI_GENERATION_ERROR",
    message: "Não foi possível gerar o simulado agora. Tente novamente em alguns instantes.",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido.",
    });
  }

  try {
    const body = req.body || {};
    const userId = sanitizeText(body.userId);
    const institution = sanitizeText(body.institution);
    const specialty = sanitizeText(body.specialty);
    const requestedCount = Number(body.questionCount);

    if (!userId) {
      return res.status(401).json({
        error: "Usuário não identificado.",
      });
    }

    if (!institution || !specialty || !requestedCount) {
      return res.status(400).json({
        error:
          "Dados obrigatórios ausentes. Selecione instituição, tema e quantidade.",
      });
    }

    const { data: accessRow, error: accessError } = await supabaseAdmin
      .from("user_access")
      .select("plan, premium_until")
      .eq("user_id", userId)
      .maybeSingle();

    if (accessError) {
      console.error("Erro ao consultar acesso do usuário:", accessError);
      return res.status(500).json({
        error: "Não foi possível validar o plano do usuário.",
      });
    }

    const isPremium = isPremiumAccess(accessRow);

    if (!isPremium) {
      const startOfToday = getStartOfTodayISOString();

      const { count, error: countError } = await supabaseAdmin
        .from("generation_logs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startOfToday);

      if (countError) {
        console.error("Erro ao contar gerações do dia:", countError);
        return res.status(500).json({
          error: "Não foi possível validar o limite de uso.",
        });
      }

      if ((count || 0) >= FREE_DAILY_GENERATION_LIMIT) {
        return res.status(403).json({
          error: `Você atingiu o limite do plano gratuito: ${FREE_DAILY_GENERATION_LIMIT} simulados por dia.`,
          code: "FREE_LIMIT_REACHED",
        });
      }
    }

    const numericRequestedCount = Math.max(parseInt(requestedCount, 10) || 1, 1);

    const safeQuestionCount = isPremium
      ? numericRequestedCount
      : Math.min(numericRequestedCount, FREE_MAX_QUESTIONS);

    let aiQuestions = [];
    let invalidAIQuestions = [];
    let aiErrorMessage = "";
    let source = "ai";
    let warning = "";

    try {
      const aiResult = await generateQuestionsWithAI({
        institution,
        specialty,
        questionCount: safeQuestionCount,
      });

      aiQuestions = aiResult.validQuestions;
      invalidAIQuestions = aiResult.invalidQuestions || [];
    } catch (aiError) {
      const friendlyAIError = getFriendlyAIErrorMessage(aiError);
      aiErrorMessage =
        aiError?.message && typeof aiError.message === "string"
          ? aiError.message
          : friendlyAIError.message;

      console.error("Erro na geração por IA:", aiError);

      const fallbackQuestions = getFallbackQuestions({
        institution,
        specialty,
        amount: safeQuestionCount,
      });

      if (fallbackQuestions.length) {
        return res.status(200).json({
          success: true,
          questions: fallbackQuestions,
          source: "fallback",
          warning:
            "Estamos com alta demanda na geração por IA no momento. Carregamos questões da base local para você continuar o treino.",
          meta: {
            plan: isPremium ? "premium" : "free",
            requestedCount: numericRequestedCount,
            deliveredCount: fallbackQuestions.length,
            limitedToFreeMax: !isPremium && numericRequestedCount > FREE_MAX_QUESTIONS,
            fallbackReasonCode: friendlyAIError.code,
          },
        });
      }

      return res.status(503).json({
        error: friendlyAIError.message,
        code: friendlyAIError.code,
        details: process.env.NODE_ENV === "development" ? aiError?.message : undefined,
      });
    }

    let finalQuestions = dedupeQuestionsByStatement(aiQuestions).slice(
      0,
      safeQuestionCount
    );

    if (finalQuestions.length < safeQuestionCount) {
      const missingCount = safeQuestionCount - finalQuestions.length;

      const fallbackQuestions = getFallbackQuestions({
        institution,
        specialty,
        amount: missingCount + 3,
      });

      const merged = dedupeQuestionsByStatement([
        ...finalQuestions,
        ...fallbackQuestions,
      ]);

      finalQuestions = merged.slice(0, safeQuestionCount);

      if (finalQuestions.length > 0 && aiQuestions.length === 0) {
        source = "fallback";
      } else if (
        finalQuestions.length > 0 &&
        finalQuestions.length > aiQuestions.length
      ) {
        source = "ai+fallback";
      }
    }

    if (finalQuestions.length === 0) {
      return res.status(500).json({
        error: "Não foi possível gerar o simulado agora. Tente novamente em instantes.",
        details:
          process.env.NODE_ENV === "development"
            ? aiErrorMessage || "Nenhuma questão disponível via IA ou fallback."
            : undefined,
      });
    }

    if (finalQuestions.length < safeQuestionCount) {
      warning =
        "Não foi possível completar a quantidade solicitada. Exibindo as questões disponíveis.";
    }

    if (source === "fallback") {
      warning =
        "Estamos com alta demanda na geração por IA no momento. Carregamos questões da base local para você continuar o treino.";
    }

    if (source === "ai+fallback") {
      warning =
        "Estamos com alta demanda na geração por IA no momento. Complementamos o simulado com questões da base local para você continuar o treino.";
    }

    await registerGenerationLog(userId);

    return res.status(200).json({
      success: true,
      questions: finalQuestions,
      source,
      warning: warning || undefined,
      meta: {
        plan: isPremium ? "premium" : "free",
        requestedCount: numericRequestedCount,
        deliveredCount: finalQuestions.length,
        limitedToFreeMax: !isPremium && numericRequestedCount > FREE_MAX_QUESTIONS,
        invalidAIQuestionsCount: invalidAIQuestions.length,
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
      details: process.env.NODE_ENV === "development" ? message : undefined,
    });
  }
}
