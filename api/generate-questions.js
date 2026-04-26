import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { institutionName, institutionStyle, topic, quantity } = request.body;

    const prompt = `
Você é um gerador de questões para simulados de residência médica.

Gere ${quantity} questões inéditas de múltipla escolha inspiradas no estilo da instituição informada.

Importante:
- Não copie questões reais.
- Não diga que a questão pertence oficialmente à instituição.
- Gere apenas questões inéditas para treino.
- Cada questão deve ter uma única alternativa correta.
- As alternativas devem ser plausíveis.
- O comentário deve ter entre 240 e 400 caracteres.
- A saída deve ser apenas JSON válido.
- Não inclua markdown.
- Não inclua explicações fora do JSON.

Instituição:
${institutionName}

Perfil da instituição:
${institutionStyle || "Questões clínicas objetivas, com foco em raciocínio diagnóstico e conduta."}

Área ou tema:
${topic || "Tema livre dentro de residência médica"}

Formato:
Múltipla escolha

Retorne um array JSON com este formato:

[
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
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "Você gera questões médicas em JSON válido, sem markdown."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7
    });

    const rawContent = completion.choices[0].message.content;
    const questions = JSON.parse(rawContent);

    return response.status(200).json({ questions });
  } catch (error) {
    console.error(error);

    return response.status(500).json({
      error: "Erro ao gerar questões."
    });
  }
}