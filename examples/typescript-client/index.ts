const baseUrl = process.env.SERVICE_BASE_URL ?? "http://localhost:3000";
const apiKey = process.env.CLIENT_API_KEY ?? "";

if (!apiKey) {
  throw new Error("Set CLIENT_API_KEY before running the example.");
}

const run = async (): Promise<void> => {
  const response = await fetch(`${baseUrl}/v1/llm`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.4",
      input: "Summarize why server-side API gateways are useful in three bullets.",
      stream: false,
    }),
  });

  const json = await response.json();
  console.log(JSON.stringify(json, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});