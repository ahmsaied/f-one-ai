import { APIGatewayProxyHandler } from "aws-lambda";
import { DataAPIClient } from "@datastax/astra-db-ts";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const astraClient = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = astraClient.db(process.env.ASTRA_DB_ENDPOINT!);

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const F1_DATA = [
  { text: "Formula One (F1) is the highest class of international racing for open-wheel single-seater formula racing cars sanctioned by the FIA. The World Drivers' Championship has been one of the premier forms of racing since its inaugural season in 1950.", source: "f1-knowledge" },
  { text: "Max Verstappen is a Belgian-Dutch racing driver competing in Formula One for Red Bull Racing. He is a four-time Formula One World Champion, having won the championship in 2021, 2022, 2023, and 2024.", source: "f1-knowledge" },
  { text: "George Russell is a British racing driver competing in Formula One for Mercedes. He won his first Formula One World Championship in 2025. Russell is known for his precise driving style and strong technical feedback.", source: "f1-knowledge" },
  { text: "Lewis Hamilton is a British racing driver who holds the record for most Formula One World Championship titles with seven. He also holds records for most wins, pole positions, and podium finishes.", source: "f1-knowledge" },
  { text: "The Qatar Grand Prix 2024 saw controversy between George Russell and Max Verstappen following an on-track incident. Russell felt Verstappen's driving was dangerous, while Verstappen defended his racing line. The dispute led to heated exchanges in post-race interviews.", source: "f1-knowledge" },
  { text: "Formula One cars generate large amounts of aerodynamic downforce and are powered by 1.6-litre turbocharged hybrid V6 engines, making them the fastest regulated road-course racing cars in the world.", source: "f1-knowledge" },
  { text: "The Formula One season consists of a series of Grands Prix held worldwide on purpose-built circuits and public roads. Results are evaluated using a points system to determine the Drivers' and Constructors' Championships.", source: "f1-knowledge" },
  { text: "Red Bull Racing is an Austrian Formula One team based in Milton Keynes, England. The team has won multiple Constructors' and Drivers' Championships, most recently with Max Verstappen.", source: "f1-knowledge" },
  { text: "Mercedes-AMG Petronas dominated Formula One from 2014 to 2021, winning eight consecutive Constructors' Championships. Lewis Hamilton won six of his seven titles with Mercedes.", source: "f1-knowledge" },
  { text: "Ferrari has been in Formula One since the inaugural 1950 season. Charles Leclerc and Carlos Sainz drove for Ferrari in 2024. Ferrari is the most successful constructor in F1 history.", source: "f1-knowledge" },
  { text: "DRS (Drag Reduction System) reduces aerodynamic drag by opening a flap on the rear wing. Drivers can activate DRS only in designated zones when within one second of the car ahead.", source: "f1-knowledge" },
  { text: "Tyre strategy is crucial in Formula One. Teams choose between Soft, Medium, and Hard compounds. Pit stop timing and tyre management frequently decide race outcomes.", source: "f1-knowledge" },
  { text: "The Monaco Grand Prix is the most prestigious and challenging race in Formula One. Held on the Circuit de Monaco, it features narrow streets, tight corners, and very limited overtaking opportunities.", source: "f1-knowledge" },
  { text: "Carlos Sainz Jr. is a Spanish racing driver who raced for Ferrari from 2021 to 2024. He won the 2024 Australian Grand Prix and joined Williams Racing for the 2025 season.", source: "f1-knowledge" },
  { text: "Charles Leclerc is a Monégasque racing driver competing for Ferrari. He is renowned for his exceptional qualifying pace and has taken multiple pole positions throughout his career.", source: "f1-knowledge" },
  { text: "Lando Norris is a British racing driver competing for McLaren. He secured his first race win at the 2024 Miami Grand Prix and has been a consistent frontrunner throughout the 2024 season.", source: "f1-knowledge" },
  { text: "McLaren Racing is a British Formula One constructor based in Woking, England. McLaren dominated F1 in the late 1980s and early 1990s with drivers Ayrton Senna and Alain Prost.", source: "f1-knowledge" },
  { text: "Safety Car periods occur when there is a crash or dangerous conditions on track. All cars must slow down and follow the Safety Car. This dramatically affects pit stop strategy and race outcomes.", source: "f1-knowledge" },
];

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const secret = event.headers["x-ingest-secret"] || event.headers["X-Ingest-Secret"];
  if (secret !== process.env.INGEST_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    // Create collection (ignore if exists)
    try {
      await db.createCollection("f1gpt", { vector: { dimension: 1536, metric: "dot_product" } });
    } catch (e: any) {
      if (!e?.message?.includes("already exists")) throw e;
    }

    const collection = db.collection("f1gpt");

    const chunks = await Promise.all(
      F1_DATA.map(async (item) => {
        const res = await openai.embeddings.create({ model: "text-embedding-ada-002", input: item.text });
        return { $vector: res.data[0].embedding, text: item.text, source: item.source };
      })
    );

    await collection.insertMany(chunks as any);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, inserted: chunks.length }) };
  } catch (err: any) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
