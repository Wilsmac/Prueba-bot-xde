const { makeWASocket, useMultiFileAuthState, DisconnectReason, getContentType } = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");

async function conectarBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./sesion");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: "silent" }),
        browser: ["Chrome", "Desktop", "3.0"],
    });

    sock.ev.on("creds.update", saveCreds);

    // Mostrar QR en terminal
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("Conexión cerrada, reconectando...", shouldReconnect);
            if (shouldReconnect) conectarBot();
        } else if (connection === "open") {
            console.log("✅ Bot conectado y listo!");
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const from = m.key.remoteJid;
        if (!from.endsWith("@g.us")) return; // Solo funciona en grupos

        // Obtener texto del mensaje (soporta texto, imágenes con caption, etc.)
        let body = "";
        const type = getContentType(m.message);
        if (type === "conversation") body = m.message.conversation;
        else if (type === "extendedTextMessage") body = m.message.extendedTextMessage.text;
        else if (type === "imageMessage") body = m.message.imageMessage.caption || "";
        else if (type === "videoMessage") body = m.message.videoMessage.caption || "";

        const prefix = ".";
        if (!body || !body.startsWith(prefix)) return;

        const args = body.slice(prefix.length).trim().split(/ +/);
        const comando = args.shift().toLowerCase();

        // Datos del grupo
        const groupMeta = await sock.groupMetadata(from);
        const sender = m.key.participant || m.key.remoteJid;
        const botNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net";

        const esAdmin = groupMeta.participants.some(p => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));
        const botEsAdmin = groupMeta.participants.some(p => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));

        if (comando === "kick") {
            if (!esAdmin) {
                return sock.sendMessage(from, { text: "❌ Solo los administradores pueden usar este comando." });
            }
            if (!botEsAdmin) {
                return sock.sendMessage(from, { text: "❌ El bot debe ser administrador del grupo para eliminar miembros." });
            }

            let target = null;

            // 1. Si responde a un mensaje del usuario
            if (m.message.extendedTextMessage?.contextInfo?.quotedMessage) {
                target = m.message.extendedTextMessage.contextInfo.participant;
            }
            // 2. Si menciona con @tag
            else if (m.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                target = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
            }
            // 3. Si escribe el número directamente (ej: .kick 50212345678)
            else if (args[0]) {
                let numero = args[0].replace(/[^0-9]/g, "");
                if (numero.length === 8) numero = "502" + numero; // Guatemala por defecto (cambia si quieres)
                if (numero.length >= 10) {
                    target = numero + "@s.whatsapp.net";
                }
            }

            if (!target) {
                return sock.sendMessage(from, {
                    text: "❌ Usa uno de estos:\n• .kick @tag\n• Responde al mensaje y escribe .kick\n• .kick 50212345678"
                });
            }

            try {
                await sock.groupParticipantsUpdate(from, [target], "remove");

                await sock.sendMessage(from, {
                    text: `✅ *¡Eliminado correctamente!*\n@${target.split("@")[0]}`,
                    mentions: [target]
                });
            } catch (err) {
                console.error(err);
                sock.sendMessage(from, {
                    text: "❌ No se pudo eliminar al usuario.\nPosibles razones:\n• Es superadmin\n• No tengo permisos suficientes\n• Error temporal de WhatsApp"
                });
            }
        }
    });
}

conectarBot();
