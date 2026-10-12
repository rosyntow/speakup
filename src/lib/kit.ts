// Server only. Adds a subscriber to Kit with tags, same as the website's AI Operator Audit.

export async function kitSubscribe({ email, firstName, tags }: { email: string; firstName: string; tags: string[] }) {
  const key = process.env.KIT_API_KEY;
  if (!key) {
    console.log(`[kit] KIT_API_KEY not set, would add ${email} with tags: ${tags.join(", ")}`);
    return;
  }
  const headers = { "X-Kit-Api-Key": key, "Content-Type": "application/json", Accept: "application/json" };
  const call = async (path: string, body: object) => {
    const res = await fetch(`https://api.kit.com/v4${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Kit ${path} ${res.status}: ${await res.text()}`);
    return res.json();
  };
  await call("/subscribers", { email_address: email, ...(firstName ? { first_name: firstName } : {}) });
  for (const name of tags) {
    const { tag } = await call("/tags", { name });
    await call(`/tags/${tag.id}/subscribers`, { email_address: email });
  }
}
