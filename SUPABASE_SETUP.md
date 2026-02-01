# Supabase Cloud Presets Setup

This guide will help you set up cloud preset sharing for your generative music app.

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **New Project**
3. Choose a name (e.g., "generative-music-presets")
4. Set a database password (save it somewhere safe)
5. Choose a region close to your users
6. Click **Create new project** (takes ~2 minutes)

## 2. Create the Database Table

In your Supabase dashboard:

1. Go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Paste this SQL and click **Run**:

```sql
-- Create presets table
CREATE TABLE presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  author VARCHAR(30) DEFAULT 'Anonymous',
  description VARCHAR(200),
  data JSONB NOT NULL,
  plays INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (but allow public access)
ALTER TABLE presets ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read all presets
CREATE POLICY "Public read access" ON presets
  FOR SELECT USING (true);

-- Allow anyone to insert new presets
CREATE POLICY "Public insert access" ON presets
  FOR INSERT WITH CHECK (true);

-- Create function to increment plays
CREATE OR REPLACE FUNCTION increment_plays(preset_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE presets SET plays = plays + 1 WHERE id = preset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for faster searches
CREATE INDEX idx_presets_name ON presets USING gin(to_tsvector('english', name));
CREATE INDEX idx_presets_created ON presets(created_at DESC);
CREATE INDEX idx_presets_featured ON presets(is_featured) WHERE is_featured = true;
```

## 3. Get Your API Keys

1. Go to **Settings** (gear icon) → **API**
2. Copy these values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (under "Project API keys")

## 4. Configure Your App

Create a `.env` file in your project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your-long-key
```

**Important:** 
- Add `.env` to your `.gitignore` if not already there
- For production, set these as environment variables in your hosting platform

## 5. Restart the Dev Server

```bash
npm run dev
```

The Cloud Presets section should now be active!

## Usage

### Browsing Presets
- Open the **Advanced** view
- Scroll to the **☁️ Cloud Presets** section
- Browse or search community presets
- Click any preset to load it (share link copied automatically)

### Sharing Presets
1. Dial in your settings
2. Go to the **Share Preset** tab
3. Enter a name (required) and optionally your name/description
4. Click **Share Current Settings**
5. Link is copied to clipboard - share anywhere!

### Sharing Links
Links look like: `https://yoursite.com/?cloud=abc123-def456`

When someone opens this link, the preset loads automatically.

## Admin: Managing Presets

To feature a preset or delete spam, use the Supabase dashboard:

1. Go to **Table Editor** → **presets**
2. Find the preset you want to manage
3. Toggle `is_featured` to true for featured presets
4. Click the trash icon to delete spam

## Cost

Free tier includes:
- 500MB database (enough for ~100,000 presets)
- Unlimited API requests
- 5GB bandwidth/month

You won't exceed this unless you have thousands of daily users.

## Troubleshooting

### "Cloud presets not configured"
- Check that `.env` file exists with correct values
- Restart the dev server after creating `.env`

### Presets not saving
- Check browser console for errors
- Verify the SQL was run correctly in Supabase

### Presets not loading from URL
- Ensure `isCloudEnabled()` returns true
- Check that the preset ID in the URL is valid
