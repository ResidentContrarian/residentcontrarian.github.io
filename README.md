# Fiction Recommendation System

A simple three-page web application that recommends fiction stories based on user-selected genre tags.

## Features

- **Page 1**: Username entry (stopgap for proof of concept)
- **Page 2**: Tag selection interface with dynamic loading from database
- **Page 3**: Personalized recommendations based on selected tags

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Backend**: Vercel Serverless Functions
- **Database**: Neon PostgreSQL (serverless)
- **Hosting**: GitHub Pages (frontend) + Vercel (API endpoints)

## Project Structure

```
residentcontrarian.github.io/
├── index.html              # Page 1: Username entry
├── select-tags.html        # Page 2: Tag selection
├── recommendations.html    # Page 3: Results display
├── api/
│   ├── tags.js            # API endpoint for fetching tags
│   └── recommendations.js # API endpoint for fetching recommendations
├── lib/
│   └── db.js              # Database utility functions
├── schema.sql             # Database schema definition
├── package.json           # Project dependencies
└── vercel.json            # Vercel configuration
```

## Setup Instructions

### 1. Database Setup (Neon)

1. Create a Neon project at https://neon.tech
2. Run the SQL commands from `schema.sql` in your Neon SQL editor
3. Add sample data (stories, authors, tags) to test the system
4. Copy your database connection string (looks like: `postgresql://user:pass@host/dbname`)

### 2. Vercel Setup

1. Install Vercel CLI (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. Link your project to Vercel:
   ```bash
   vercel link
   ```

3. Add your Neon database URL as an environment variable:
   ```bash
   vercel env add NEON_DATABASE_URL
   ```
   Paste your connection string when prompted.

4. Install dependencies:
   ```bash
   npm install
   ```

5. Deploy to Vercel:
   ```bash
   vercel --prod
   ```

### 3. GitHub Pages Setup

1. Push your code to your GitHub repository
2. Go to Settings → Pages
3. Set source to main branch
4. Your site will be available at: `https://yourusername.github.io/`

Note: The API endpoints will be served by Vercel, while the HTML pages are served by GitHub Pages.

## Environment Variables

Required environment variables in Vercel:

- `NEON_DATABASE_URL`: Your Neon PostgreSQL connection string

## How It Works

### User Flow

1. User enters their username on the landing page
2. Username is stored in sessionStorage
3. User selects fiction genre tags (Fantasy, Sci-Fi, etc.)
4. Selected tags are passed to the recommendations API
5. API queries database for stories matching the tags
6. Stories are ranked by: tag matches → follower count → recency
7. Results are displayed with story title, author, summary, and metadata

### Recommendation Algorithm

The system ranks stories using this priority:
1. **Tag match count**: Stories matching more selected tags appear first
2. **Follower count**: Among stories with equal tag matches, more popular stories rank higher
3. **Recency**: Recent publications break ties

See `lib/db.js:getRecommendationsByTags()` for the implementation.

## Development

To test locally:

```bash
# Install dependencies
npm install

# Run Vercel dev server
vercel dev
```

This will start a local server that emulates the Vercel environment.

## Database Schema

See `schema.sql` for the complete database structure. Key tables:

- **tags**: Fiction genre tags
- **stories**: Fiction stories with metadata
- **author_profiles**: Author information
- **story_tags**: Many-to-many relationship between stories and tags
- **story_follows**: User follows (for popularity tracking)
- **v_story_follow_counts**: View aggregating follower counts

## Future Enhancements

- Replace username input with actual authentication
- Add user accounts and save preferences
- Implement story reading interface
- Add more sophisticated recommendation algorithms
- Include content filtering and ratings
- Add search functionality

## License

MIT
