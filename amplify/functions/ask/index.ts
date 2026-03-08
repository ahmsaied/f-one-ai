import { APIGatewayProxyHandler } from "aws-lambda";
import { DataAPIClient } from "@datastax/astra-db-ts";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const astraClient = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = astraClient.db(process.env.ASTRA_DB_ENDPOINT!);
const collection = db.collection("f1gpt");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const { question } = JSON.parse(event.body || "{}");
    if (!question?.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Question is required" }) };
    }

    // 1. Embed the question
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: question,
    });
    const embedding = embeddingRes.data[0].embedding;

    // 2. Query Astra DB
    const docs = await collection
      .find(null, { sort: { $vector: embedding }, limit: 10 })
      .toArray();
    const context = docs.map((d: any) => d.text).filter(Boolean);

    // 3. GPT-4o answer
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert Formula 1 analyst. Answer questions accurately using the context provided. Be concise but thorough. Format your answer in clear paragraphs.`,
        },
        {
          role: "user",
          content: `Context:\n${context.join("\n\n")}\n\nQuestion: ${question}`,
        },
      ],
    });

    const answer = response.choices[0].message.content;
    const sources = [...new Set(docs.map((d: any) => d.source).filter(Boolean))];

    return { statusCode: 200, headers, body: JSON.stringify({ answer, sources }) };
  } catch (err: any) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
