export const sendSigmaAppSlackAlert = async function (
  text: string,
  appSource: string,
) {
  if (process.env.SLACK_ALERTS_WEBHOOK === "false") {
    console.warn("Slack webhook not configured");
    return;
  }

  // only sending Slack alerts for sigma app source
  if (!appSource || appSource !== "sigma") {
    return;
  }

  const MAX_WAIT_TIME_MS = 5000; // 5 seconds max wait

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      MAX_WAIT_TIME_MS,
    );

    const response = await fetch(process.env.SLACK_ALERTS_WEBHOOK!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status !== 200) {
      const responseData = await response.text();
      console.error("Slack webhook failed:", response.status, responseData);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("Slack webhook request timed out after 5 seconds");
    } else {
      console.error("Error sending Slack alert:", error);
    }
  }
};
