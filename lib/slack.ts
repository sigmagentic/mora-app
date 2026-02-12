import https from "https";

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
    const url = new URL(process.env.SLACK_ALERTS_WEBHOOK!);

    const payload = JSON.stringify({
      text,
    });

    const options = {
      hostname: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 443,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    // Create a promise that resolves when the request completes
    const requestPromise = new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let responseData = "";

        // Consume response data to prevent memory leaks
        res.on("data", (chunk) => {
          responseData += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 200) {
            resolve({ success: true, statusCode: res.statusCode });
          } else {
            console.error(
              "Slack webhook failed:",
              res.statusCode,
              responseData,
            );
            resolve({
              success: false,
              statusCode: res.statusCode,
              error: responseData,
            });
          }
        });
      });

      req.on("error", (err) => {
        console.error("Slack webhook error:", err);
        resolve({ success: false, error: err.message });
      });

      // Set timeout on the request
      req.setTimeout(MAX_WAIT_TIME_MS, () => {
        req.destroy();
        console.warn("Slack webhook request timed out after 5 seconds");
        resolve({ success: false, error: "Request timeout" });
      });

      req.write(payload);
      req.end();
    });

    // Create a timeout promise (backup)
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        console.warn(
          "Slack webhook wait time exceeded 5 seconds, continuing...",
        );
        resolve({ success: false, error: "Timeout exceeded" });
      }, MAX_WAIT_TIME_MS);
    });

    // Race between request completion and timeout - whichever finishes first
    await Promise.race([requestPromise, timeoutPromise]);
  } catch (error) {
    console.error("Error sending Slack alert:", error);
  }
};
