// Telegram bot for NOTES VATIKA (no database needed).
// Netlify > Environment variables:
//   BOT_TOKEN, WEBHOOK_SECRET, ADMIN_CHAT_ID, FILE_C10, FILE_C12
//   optional: PRICE_C10, PRICE_C12 (default 49)
const API = "https://api.telegram.org/bot" + process.env.BOT_TOKEN;
const ADMIN = String(process.env.ADMIN_CHAT_ID || "");
const BUNDLES = {
  c10: { name: "Class 10 Solved TMA - All Subjects", price: process.env.PRICE_C10 || 49, file: process.env.FILE_C10 },
  c12: { name: "Class 12 Solved TMA - All Subjects", price: process.env.PRICE_C12 || 49, file: process.env.FILE_C12 }
};

async function tg(method, body) {
  const r = await fetch(API + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}
const say = (chat_id, text) => tg("sendMessage", { chat_id, text });

async function onMessage(m) {
  const id = String(m.chat.id);
  const text = (m.text || "").trim();
  const isAdmin = ADMIN && id === ADMIN;

  if (text === "/myid") return say(id, "Your chat ID: " + id);

  // Owner sends each PDF to the bot once to get its file ID.
  if (isAdmin && m.document) {
    return say(id, "File ID for " + (m.document.file_name || "this file") + ":\n" + m.document.file_id);
  }

  // Customer sends a payment screenshot: forward it to the owner.
  if (!isAdmin && (m.photo || m.document)) {
    await tg("forwardMessage", { chat_id: ADMIN, from_chat_id: id, message_id: m.message_id });
    return say(id, "Screenshot received. We will check it and send your PDF soon.");
  }

  const mm = text.match(/^\/start(?:\s+(c10|c12)(?:_(\d{12}))?)?$/);
  if (mm && mm[1]) {
    const b = BUNDLES[mm[1]];
    const who = [m.from.first_name, m.from.username ? "@" + m.from.username : ""].filter(Boolean).join(" ");
    const proof = mm[2] ? "UTR " + mm[2] : "Screenshot (should follow in this chat)";
    await say(id, mm[2]
      ? "Thanks! We got your payment details (UTR " + mm[2] + "). You can also send a payment screenshot here. We will send your PDF after checking."
      : "Thanks! Please send a screenshot of your payment here. We will send your PDF after checking it.");
    await tg("sendMessage", {
      chat_id: ADMIN,
      text: "New order\n" + b.name + "\nAmount: Rs " + b.price + "\nTelegram: " + who + "\nProof: " + proof,
      reply_markup: { inline_keyboard: [[
        { text: "Approve", callback_data: "ok:" + mm[1] + ":" + id },
        { text: "Reject", callback_data: "no:" + mm[1] + ":" + id }
      ]] }
    });
    return;
  }
  if (text.startsWith("/start")) {
    return say(id, "Welcome to NOTES VATIKA. Please pay on our website first, then use the Telegram button there for your class.");
  }
}

async function onCallback(q) {
  if (String(q.from.id) !== ADMIN) {
    return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Not allowed" });
  }
  const [act, key, cid] = (q.data || "").split(":");
  const b = BUNDLES[key];
  const msg = q.message;
  if (!b || !cid) return tg("answerCallbackQuery", { callback_query_id: q.id });

  if (act === "ok") {
    const r = await tg("sendDocument", { chat_id: cid, document: b.file, caption: "Thank you! Here is your " + b.name + ". Study well!" });
    if (!r.ok) {
      return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Could not send the PDF. Check the file ID setting.", show_alert: true });
    }
  } else if (act === "no") {
    await say(cid, "Sorry, we could not find your payment. Please check and send your payment screenshot again.");
  } else {
    return tg("answerCallbackQuery", { callback_query_id: q.id });
  }
  await tg("editMessageText", {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    text: msg.text + "\n\n" + (act === "ok" ? "Approved - PDF sent" : "Rejected")
  });
  await tg("answerCallbackQuery", { callback_query_id: q.id });
}

exports.handler = async (event) => {
  if (event.headers["x-telegram-bot-api-secret-token"] !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 401, body: "no" };
  }
  try {
    const u = JSON.parse(event.body || "{}");
    if (u.message) await onMessage(u.message);
    else if (u.callback_query) await onCallback(u.callback_query);
  } catch (e) {
    console.error(e);
  }
  return { statusCode: 200, body: "ok" };
};

