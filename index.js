import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const app = express();
app.use(express.json());

// --- Supabase setup ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// --- WhatsApp client setup ---
const client = new Client({
  authStrategy: new LocalAuth(), // Stores session in .wwebjs_auth
});

let isClientReady = false;

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR code above to log in.');
});

client.on('ready', async () => {
  console.log('WhatsApp bot is ready!');
  isClientReady = true;

  // List all groups and IDs (for debugging)
  const chats = await client.getChats();
  chats.forEach(chat => {
    if (chat.isGroup) {
      console.log(`Group Name: ${chat.name} | ID: ${chat.id._serialized}`);
    }
  });
});

// --- Send message to group ---
async function sendToGroup(name, url) {
  if (!isClientReady) {
    console.log('Client not ready yet, cannot send message.');
    return;
  }
  try {
    const chat = await client.getChatById(process.env.WHATSAPP_GROUP_ID);
    if (!chat) return console.error('Chat not found! Check group ID.');
    
    const message = `📝 *${name}*\n🔗 ${url}`;
    await chat.sendMessage(message);

    console.log('Message sent to group:', message);
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

// --- Supabase Realtime subscription ---
console.log('Subscribing to table changes...');
const subscription = supabase
  .channel('table_changes')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: process.env.SUPABASE_TABLE },
    async payload => {
      console.log('Full payload received:', payload);

      const { name, url } = payload.new;

      if (url && name) {
        console.log('url + name exist, sending...');
        await sendToGroup(name, url);
      } else {
        console.log('No url or name field in new row.');
      }
    }
  )
  .subscribe();

subscription.on('error', error => {
  console.error('Subscription error:', error);
});

console.log('Subscribed successfully!');

// --- Health check endpoint ---
app.get('/', (req, res) => res.send('Bot server running'));

// --- Start Express server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- Initialize WhatsApp client ---
client.initialize();
