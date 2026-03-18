using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

var baseUrl = Environment.GetEnvironmentVariable("SERVICE_BASE_URL") ?? "http://localhost:3000";
var apiKey = Environment.GetEnvironmentVariable("CLIENT_API_KEY");

if (string.IsNullOrWhiteSpace(apiKey))
{
    throw new InvalidOperationException("Set CLIENT_API_KEY before running the example.");
}

using var http = new HttpClient();
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

var payload = new
{
    model = "gpt-5.4",
    input = "Summarize why server-side API gateways are useful in three bullets.",
    stream = false
};

using var response = await http.PostAsync(
    $"{baseUrl}/v1/llm",
    new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"));

var body = await response.Content.ReadAsStringAsync();
Console.WriteLine(body);