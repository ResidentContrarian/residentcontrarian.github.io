import { Webhook } from 'svix';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the Svix headers for verification
  const svix_id = req.headers['svix-id'];
  const svix_timestamp = req.headers['svix-timestamp'];
  const svix_signature = req.headers['svix-signature'];

  // If there are no headers, return error
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).json({ error: 'Missing svix headers' });
  }

  // Get the body
  const payload = req.body;
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your webhook secret
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);

  let evt;

  // Verify the webhook
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return res.status(400).json({ error: 'Webhook verification failed' });
  }

  // Handle the webhook
  const eventType = evt.type;

  if (eventType === 'user.created') {
    const { id, email_addresses, username, first_name, last_name } = evt.data;

    const primaryEmail = email_addresses.find(email => email.id === evt.data.primary_email_address_id);

    try {
      // Insert user into database
      await sql`
        INSERT INTO users (id, username, email, display_name, created_at)
        VALUES (
          ${id},
          ${username || primaryEmail?.email_address || id},
          ${primaryEmail?.email_address},
          ${first_name && last_name ? `${first_name} ${last_name}` : first_name || last_name || username || 'User'},
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `;

      console.log(`User created in database: ${id}`);
    } catch (error) {
      console.error('Error creating user in database:', error);
      return res.status(500).json({ error: 'Failed to create user in database' });
    }
  }

  if (eventType === 'user.updated') {
    const { id, email_addresses, username, first_name, last_name } = evt.data;

    const primaryEmail = email_addresses.find(email => email.id === evt.data.primary_email_address_id);

    try {
      await sql`
        UPDATE users
        SET
          username = ${username || primaryEmail?.email_address || id},
          email = ${primaryEmail?.email_address},
          display_name = ${first_name && last_name ? `${first_name} ${last_name}` : first_name || last_name || username || 'User'}
        WHERE id = ${id}
      `;

      console.log(`User updated in database: ${id}`);
    } catch (error) {
      console.error('Error updating user in database:', error);
      return res.status(500).json({ error: 'Failed to update user in database' });
    }
  }

  res.status(200).json({ success: true });
}
