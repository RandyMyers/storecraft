const tls = require("tls");

/**
 * Attempt TLS handshake to :443 with SNI = hostname (validates cert chain when rejectUnauthorized).
 */
function probeTls(hostname, timeoutMs = 12000) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return Promise.resolve({ ok: false, error: "empty hostname" });

  return new Promise((resolve) => {
    let settled = false;
    const done = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: true,
      },
      () => {
        socket.end();
        done({ ok: true });
      },
    );

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      done({ ok: false, error: "timeout" });
    });

    socket.on("error", (err) => {
      done({ ok: false, error: err.message || "tls_error" });
    });
  });
}

module.exports = { probeTls };
