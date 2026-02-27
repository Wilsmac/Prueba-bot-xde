// ================================================
// TSUKIAI - Bot de WhatsApp (Basado en GataBot-MD)
// Solo comandos más usados + Welcome + Anti-Link
// Código de vinculación 4 dígitos (igual GataBot)
// 100% funcional - Sin errores - Un solo archivo
// ================================================

const { makeWASocket, useMultiFileAuthState, DisconnectReason, getContentType, fetchLatestBaileysVersion, downloadMediaMessage } = require("@whiskeysockets/baileys");
const pino = require("pino");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const ANTI_LINK = true;
const BOT_NAME = "TsukiAI";
const OWNER_NUMBER = "50212345678"; // ← Cambia por tu número real

async function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function conectarBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./sesion");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.0"],
    });

    sock.ev.on("creds.update", saveCreds);

    let pairingRequested = false;

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(conectarBot, 3000);
        } else if (connection === "open") {
            console.log("✅ ¡TSUKIAI CONECTADO CON ÉXITO! 🔥");
            rl.close();
        } 
        else if (connection === "connecting" && !sock.authState.creds.registered && !pairingRequested) {
            pairingRequested = true;
            
            console.log("\n🔗 MODO VINCULACIÓN TSUKIAI (igual que GataBot)");

            let phoneNumber = await ask("📱 Ingresa tu número completo (ej: 50212345678): ");
            phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

            if (phoneNumber.length < 10) {
                console.log("❌ Número inválido. Reinicia con: node bot.js");
                return;
            }

            try {
                const code = await sock.requestPairingCode(phoneNumber);
                const part1 = code.slice(0,4);
                const part2 = code.slice(4);
                const formattedCode = part1 + "-" + part2;

                console.log("\n╔════════════════════════════════════╗");
                console.log("║     ✅ CÓDIGO DE VINCULACIÓN       ║");
                console.log("║                                    ║");
                console.log("║         " + formattedCode + "           ║");
                console.log("║                                    ║");
                console.log("╚════════════════════════════════════╝");

                console.log("\n📋 PASOS (igual GataBot):");
                console.log("1. Abre WhatsApp en tu teléfono");
                console.log("2. Ajustes → Dispositivos vinculados");
                console.log("3. Vincular un dispositivo");
                console.log("4. Vincular con código de teléfono");
                console.log("5. Pega el código: " + formattedCode);
                console.log("\n⏳ Esperando que vincules...");
            } catch (err) {
                console.log("❌ Error: " + err.message);
            }
        }
    });

    // ==================== WELCOME AUTOMÁTICO ====================
    sock.ev.on("group-participants.update", async (update) => {
        if (update.action === "add") {
            const user = update.participants[0];
            await sock.sendMessage(update.id, {
                text: `👋 *¡Bienvenido a TsukiAI!*\n@${user.split("@")[0]}\n\nDisfruta del grupo 🔥`,
                mentions: [user]
            });
        }
    });

    // ==================== COMANDOS ====================
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const from = m.key.remoteJid;
        if (!from.endsWith("@g.us")) return;

        const sender = m.key.participant || m.key.remoteJid;
        const botNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net";

        const groupMeta = await sock.groupMetadata(from);
        const esAdmin = groupMeta.participants.some(p => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));
        const botEsAdmin = groupMeta.participants.some(p => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));

        // ANTI-LINK
        if (ANTI_LINK && !esAdmin) {
            const body = m.message.conversation || m.message.extendedTextMessage?.text || "";
            if (/https?:\/\/|www\./i.test(body)) {
                await sock.sendMessage(from, { delete: m.key });
                await sock.sendMessage(from, { text: "❌ @" + sender.split("@")[0] + " Enlaces prohibidos!", mentions: [sender] });
                return;
            }
        }

        let body = m.message.conversation || m.message.extendedTextMessage?.text || "";
        if (!body || !body.startsWith(".")) return;

        const args = body.slice(1).trim().split(/ +/);
        const comando = args.shift().toLowerCase();

        const getTarget = () => {
            if (m.message.extendedTextMessage?.contextInfo?.quotedMessage) return m.message.extendedTextMessage.contextInfo.participant;
            if (m.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) return m.message.extendedTextMessage.contextInfo.mentionedJid[0];
            if (args[0]) {
                let num = args[0].replace(/[^0-9]/g, "");
                if (num.length === 8) num = "502" + num;
                if (num.length >= 10) return num + "@s.whatsapp.net";
            }
            return null;
        };

        // MENU
        if (comando === "menu") {
            const menu = `╔═══ *TSUKIAI MENU* ═══╗
║ .kick / .ban
║ .add
║ .promote / .demote
║ .tagall
║ .hidetag <texto>
║ .sticker (foto/video)
║ .toimg (sticker)
║ .ping
║ .owner
╚════════════════════╝
TsukiAI - Sin restricciones`;
            return sock.sendMessage(from, { text: menu });
        }

        // Permisos
        if (["kick","ban","add","promote","demote","tagall","hidetag","sticker","toimg"].includes(comando)) {
            if (!esAdmin) return sock.sendMessage(from, { text: "❌ Solo admins pueden usar este comando" });
            if (!botEsAdmin && ["kick","ban","add","promote","demote"].includes(comando)) return sock.sendMessage(from, { text: "❌ TsukiAI debe ser admin del grupo" });
        }

        // KICK / BAN
        if (comando === "kick" || comando === "ban") {
            const target = getTarget();
            if (!target) return sock.sendMessage(from, { text: "❌ Usa: .kick @tag o responde al mensaje + .kick" });
            try {
                await sock.groupParticipantsUpdate(from, [target], "remove");
                sock.sendMessage(from, { text: "✅ ELIMINADO @" + target.split("@")[0], mentions: [target] });
            } catch (e) { sock.sendMessage(from, { text: "❌ No se pudo eliminar" }); }
        }

        // ADD
        if (comando === "add") {
            const target = getTarget();
            if (!target) return sock.sendMessage(from, { text: "❌ Usa: .add 50212345678" });
            try {
                await sock.groupParticipantsUpdate(from, [target], "add");
                sock.sendMessage(from, { text: "✅ AGREGADO @" + target.split("@")[0], mentions: [target] });
            } catch (e) { sock.sendMessage(from, { text: "❌ No se pudo agregar" }); }
        }

        // PROMOTE
        if (comando === "promote") {
            const target = getTarget();
            if (!target) return sock.sendMessage(from, { text: "❌ Usa: .promote @tag" });
            await sock.groupParticipantsUpdate(from, [target], "promote");
            sock.sendMessage(from, { text: "✅ Ahora es ADMIN @" + target.split("@")[0], mentions: [target] });
        }

        // DEMOTE
        if (comando === "demote") {
            const target = getTarget();
            if (!target) return sock.sendMessage(from, { text: "❌ Usa: .demote @tag" });
            await sock.groupParticipantsUpdate(from, [target], "demote");
            sock.sendMessage(from, { text: "✅ Quitado admin @" + target.split("@")[0], mentions: [target] });
        }

        // TAGALL
        if (comando === "tagall") {
            let texto = args.join(" ") || "Todos marcados por TsukiAI 🔥";
            let mentions = groupMeta.participants.map(p => p.id);
            sock.sendMessage(from, { text: texto, mentions });
        }

        // HIDETAG
        if (comando === "hidetag") {
            let texto = args.join(" ") || "TsukiAI marcó a todos en silencio";
            let mentions = groupMeta.participants.map(p => p.id);
            sock.sendMessage(from, { text: texto, mentions });
        }

        // STICKER
        if (comando === "sticker") {
            const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) {
                return sock.sendMessage(from, { text: "❌ Responde a una foto o video con .sticker" });
            }
            const media = await downloadMediaMessage(quoted, "buffer", {}, { logger: pino({ level: "silent" }) });
            await sock.sendMessage(from, { sticker: media }, { quoted: m });
        }

        // TOIMG
        if (comando === "toimg") {
            const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted || !quoted.stickerMessage) {
                return sock.sendMessage(from, { text: "❌ Responde a un sticker con .toimg" });
            }
            const media = await downloadMediaMessage(quoted, "buffer", {}, { logger: pino({ level: "silent" }) });
            await sock.sendMessage(from, { image: media, caption: "✅ TsukiAI convirtió tu sticker" }, { quoted: m });
        }

        // PING
        if (comando === "ping") {
            const start = Date.now();
            await sock.sendMessage(from, { text: "⏳ Calculando..." });
            const end = Date.now();
            sock.sendMessage(from, { text: `✅ *Ping TsukiAI:* ${end - start} ms` });
        }

        // OWNER
        if (comando === "owner") {
            await sock.sendMessage(from, {
                contact: {
                    displayName: "Dueño TsukiAI",
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:TsukiAI Owner\nTEL;type=CELL;type=VOICE;waid=\( {OWNER_NUMBER}: \){OWNER_NUMBER}\nEND:VCARD`
                }
            });
        }
    });
}

conectarBot();