/* PiPrime payments patch: load AFTER the main script in index.html */
(function () {
  var API = window.PIPRIME_API_URL || "https://piprime-api.alhwryh311.workers.dev";

  async function apiPost(path, body) {
    var headers = { "Content-Type": "application/json" };
    if (window.piAccessToken) headers["Authorization"] = "Bearer " + window.piAccessToken;
    var res = await fetch(API + path, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || "HTTP " + res.status);
    return data;
  }

  window.piPrimeApi = {
    getProducts: function () {
      return fetch(API + "/api/products").then(function (r) { return r.json(); });
    },
    createProduct: function (p) { return apiPost("/api/products", p); },
    approvePayment: function (paymentId) {
      return apiPost("/api/pi/approve", { paymentId: paymentId });
    },
    completePayment: function (paymentId, txid) {
      return apiPost("/api/pi/complete", { paymentId: paymentId, txid: txid });
    }
  };

  window.connectPi = async function () {
    var btn = document.getElementById("authBtn");
    if (!window.Pi) {
      openModal("Pi Browser", "<p>Open inside Pi Browser to connect your Pi account.</p>");
      return;
    }
    btn.textContent = "...";
    try {
      var auth = await window.Pi.authenticate(["username", "payments"], async function (p) {
        try {
          var txid = p && p.transaction && p.transaction.txid;
          if (txid) {
            await window.piPrimeApi.completePayment(p.identifier, txid);
            updateStatus("Recovered payment: " + p.identifier);
          } else {
            updateStatus("Incomplete payment: " + p.identifier);
          }
        } catch (e) {
          updateStatus("Incomplete payment error: " + e.message);
        }
      });
      currentUser = auth.user;
      window.piAccessToken = auth.accessToken;
      btn.classList.add("connected");
      btn.textContent = "✓ @" + currentUser.username;
      updateStatus("✓ @" + currentUser.username);
      await syncConversationsFromDb();
    } catch (e) {
      btn.textContent = t("connectPi");
    }
  };

  window.payAmount = async function (amount, memoText, metadataObj) {
    if (!window.Pi) {
      openModal("Pi Browser", "<p>Pi payments work inside Pi Browser.</p>");
      return;
    }
    if (!currentUser) {
      await window.connectPi();
      if (!currentUser) return;
    }
    var normalizedAmount = Number(amount);
    if (isNaN(normalizedAmount) || normalizedAmount <= 0) return;

    updateStatus(memoText + " (" + normalizedAmount + " Test-Pi)...");

    try {
      await window.Pi.createPayment(
        {
          amount: normalizedAmount,
          memo: memoText,
          metadata: Object.assign({}, metadataObj, { buyer: currentUser.username })
        },
        {
          onReadyForServerApproval: async function (paymentId) {
            try {
              updateStatus("Approving: " + paymentId);
              await window.piPrimeApi.approvePayment(paymentId);
            } catch (e) {
              updateStatus("Approve error: " + e.message);
            }
          },
          onReadyForServerCompletion: async function (paymentId, txid) {
            try {
              updateStatus("Completing: " + txid);
              await window.piPrimeApi.completePayment(paymentId, txid);
              updateStatus("Completed TXID: " + txid);
            } catch (e) {
              updateStatus("Complete error: " + e.message);
            }
          },
          onCancel: function (paymentId) {
            updateStatus("Cancelled: " + paymentId);
          },
          onError: function (error) {
            updateStatus("Error: " + (error && error.message ? error.message : error));
          }
        }
      );
    } catch (err) {
      updateStatus("Error: " + (err && err.message ? err.message : err));
    }
  };
})();
