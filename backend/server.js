const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const cassandra = require('cassandra-driver');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

dotenv.config();

// Define PORT early
const PORT = process.env.PORT || 5000;

const app = express();

app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

// Check for secure bundle file
const bundlePath = process.env.SECURE_CONNECT_BUNDLE_PATH;
if (!fs.existsSync(bundlePath)) {
    console.error('Secure connect bundle not found!');
    console.error('Looking for bundle at:', bundlePath);
    console.error('Please check the SECURE_CONNECT_BUNDLE_PATH in your .env file');
    process.exit(1);
}

// Initialize Cassandra client
const client = new cassandra.Client({
    cloud: {
        secureConnectBundle: bundlePath
    },
    credentials: {
        username: process.env.ASTRA_DB_USERNAME,
        password: process.env.ASTRA_DB_PASSWORD
    },
    keyspace: process.env.ASTRA_DB_KEYSPACE
});

// Add debug logging
console.log('Attempting to connect with:', {
    bundlePath,
    keyspace: process.env.ASTRA_DB_KEYSPACE,
    username: process.env.ASTRA_DB_USERNAME ? 'Set' : 'Missing',
    password: process.env.ASTRA_DB_PASSWORD ? 'Set' : 'Missing'
});

// Replace GROQ initialization with axios instance
const groqApi = axios.create({
    baseURL: 'https://api.groq.com/openai/v1',
    headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

// Create tables
async function setupDatabase() {
    try {
        // Create users table
        const createUsersTable = `
            CREATE TABLE IF NOT EXISTS users (
                id uuid PRIMARY KEY,
                name text,
                date_of_birth date,
                time_of_birth text,
                gender text,
                state text,
                city text,
                created_at timestamp
            )
        `;

        await client.execute(createUsersTable);
        console.log("Users table created/verified");

        // Create index on created_at
        const createIndex = `
            CREATE INDEX IF NOT EXISTS users_created_at_idx ON users(created_at)
        `;
        
        await client.execute(createIndex);
        console.log("Created index on users.created_at");

        // Verify table exists and has data
        const countQuery = "SELECT COUNT(*) as count FROM users";
        const result = await client.execute(countQuery);
        console.log(`Users table has ${result.rows[0].count} records`);

        // Create spiritual readings table
        const createReadingsTable = `
            CREATE TABLE IF NOT EXISTS spiritual_readings (
                user_id uuid PRIMARY KEY,
                kundali_insights text,
                ai_recommendations text,
                spiritual_guidance text,
                created_at timestamp
            )
        `;

        await client.execute(createReadingsTable);
        console.log("Spiritual readings table created/verified");

    } catch (err) {
        console.error("Error setting up database tables:", err);
        throw err;
    }
}

// Generate spiritual insights using GROQ
async function generateSpiritualInsights(userData) {
    try {
        console.log("Attempting to generate insights for:", userData.name);
        
        const prompt = `
        As a Vedic astrology expert, analyze the following birth details and provide a comprehensive, practical reading in exactly three sections:
        Name: ${userData.name}
        Date of Birth: ${userData.dateOfBirth}
        Time: ${userData.time}
        Location: ${userData.city}, ${userData.state}

        Please provide detailed analysis in exactly these three sections, with at least 100 words per section:

        Section 1: Kundali & Horoscope Generation
        Analyze the 12 houses of the birth chart and provide specific insights about:
        - Career prospects and professional growth based on the 10th house
        - Relationship dynamics from the 7th and 5th houses
        - Financial outlook from the 2nd and 11th houses
        - Educational and intellectual capabilities from the 4th and 5th houses
        - Family life and domestic harmony from the 4th house
        Focus on practical implications and timing of opportunities. Include specific predictions about career paths, relationships, and personal growth.

        Section 2: AI Recommendations
        Provide specific, actionable recommendations about:
        - Gemstones that align with the birth chart's planetary positions
        - Detailed pooja and ritual recommendations with their specific benefits
        - Timing for important activities and decisions
        - Specific do's and don'ts based on planetary positions
        - Dietary and lifestyle recommendations
        Include practical implementation steps and expected benefits for each recommendation.

        Section 3: Spiritual Content Delivery
        Detail personalized spiritual practices including:
        - Meditation techniques aligned with planetary positions
        - Physical exercises and yoga based on birth chart elements
        - Sleep optimization practices based on moon sign
        - Breathing exercises for energy balance
        - Daily routines for spiritual growth
        Focus on practical, implementable advice that creates harmony in daily life.

        Important: Write in a professional, authoritative tone without any disclaimers. Provide specific, practical advice that can be implemented immediately. Make direct connections between astrological aspects and real-life applications.
        `;

        const response = await groqApi.post('/chat/completions', {
            model: "mixtral-8x7b-32768",
            messages: [{ 
                role: "system", 
                content: "You are an expert Vedic astrologer with decades of experience. Provide authoritative, practical insights without any disclaimers or qualifications. Focus on specific, actionable advice based on authentic Vedic astrology principles."
            },
            { 
                role: "user", 
                content: prompt 
            }],
            temperature: 0.7,
            max_tokens: 4096
        });

        console.log("GROQ API Response received");

        if (!response.data?.choices?.[0]?.message?.content) {
            throw new Error('Invalid response from GROQ API');
        }

        const content = response.data.choices[0].message.content;
        
        // Split content into sections and clean up
        const sections = content.split(/Section \d+:/).filter(Boolean).map(section => 
            section.trim().replace(/^\s*[\r\n]+/g, '')
        );

        return {
            kundaliSection: sections[0] || '',
            recommendationsSection: sections[1] || '',
            practiceSection: sections[2] || ''
        };

    } catch (error) {
        console.error('GROQ API Error:', error.response?.data || error.message);
        
        // Return a more detailed fallback response
        return {
            kundaliSection: `
                Detailed Kundali Analysis for ${userData.name}:
                Born on ${userData.dateOfBirth} at ${userData.time} in ${userData.city}, ${userData.state}

                Your birth chart reveals significant planetary positions that indicate a strong potential for both material success and spiritual growth. The placement of major planets suggests:

                1. Career and Professional Life:
                - Strong leadership abilities due to Sun's position
                - Excellent communication skills from Mercury's influence
                - Innovation and technical aptitude from Uranus aspects
                
                2. Relationships and Personal Life:
                - Deep emotional connections indicated by Moon's placement
                - Strong family bonds shown by Venus position
                - Lasting friendships and social network from Jupiter's influence

                3. Financial Prospects:
                - Good wealth potential through career advancement
                - Multiple income sources indicated
                - Strong investment opportunities identified

                4. Health and Vitality:
                - Generally good health indicated
                - Areas requiring attention: stress management
                - Beneficial periods for health improvements identified
            `,
            recommendationsSection: `
                Spiritual and Gemstone Recommendations:

                1. Beneficial Gemstones:
                - Primary Stone: Blue Sapphire for career growth
                - Secondary Stone: Pearl for emotional balance
                - Supporting Stone: Yellow Sapphire for wisdom

                2. Spiritual Practices:
                - Morning Meditation: 20 minutes at sunrise
                - Evening Prayer: During sunset hours
                - Weekly Temple Visits: Preferably on Thursdays

                3. Mantras for Daily Practice:
                - Morning: Om Namo Narayanaya (108 times)
                - Evening: Om Namah Shivaya (54 times)
                - Special Occasions: Gayatri Mantra

                4. Dietary Guidelines:
                - Favor: Fresh fruits, whole grains
                - Moderate: Spicy foods
                - Avoid: Processed foods
            `,
            practiceSection: `
                Personal Development Guide:

                1. Daily Routine (Dinacharya):
                - 5:30 AM: Wake up during Brahma Muhurta
                - 6:00 AM: Yoga and Pranayama
                - 7:00 AM: Meditation and Mantra Chanting
                - Evening: Self-reflection and journaling

                2. Yoga Practices:
                - Surya Namaskar: 12 rounds
                - Meditation: Mindfulness techniques
                - Breathing: Alternate nostril breathing

                3. Professional Development:
                - Focus on leadership roles
                - Enhance communication skills
                - Develop technical expertise

                4. Relationship Enhancement:
                - Practice active listening
                - Show gratitude daily
                - Maintain work-life balance
            `
        };
    }
}

// API endpoint to save user data and generate reading
app.post("/api/users", async (req, res) => {
    console.log("Received request body:", req.body);

    const { name, dateOfBirth, time, gender, state, city } = req.body;

    if (!name || !dateOfBirth || !time || !gender || !state || !city) {
        return res.status(400).json({ 
            error: "All fields are required",
            received: { name, dateOfBirth, time, gender, state, city }
        });
    }

    try {
        // Generate UUID for the user
        const userId = cassandra.types.Uuid.random();

        // 1. Save user data
        const saveQuery = `
            INSERT INTO users (
                id, name, date_of_birth, time_of_birth, 
                gender, state, city, created_at
            ) 
            VALUES (?, ?, ?, ?, ?, ?, ?, toTimestamp(now()))
        `;

        await client.execute(saveQuery, [
            userId,
            name, 
            dateOfBirth, 
            time, 
            gender, 
            state, 
            city
        ], { prepare: true });

        // 2. Generate spiritual insights
        const insights = await generateSpiritualInsights({
            name, dateOfBirth, time, gender, state, city
        });

        // 3. Save the reading
        const saveReadingQuery = `
            INSERT INTO spiritual_readings (
                user_id, kundali_insights, ai_recommendations, 
                spiritual_guidance, created_at
            )
            VALUES (?, ?, ?, ?, toTimestamp(now()))
        `;

        const { kundaliSection, recommendationsSection, practiceSection } = 
            typeof insights === 'string' 
                ? {
                    kundaliSection: insights.split('\n\n')[0] || '',
                    recommendationsSection: insights.split('\n\n')[1] || '',
                    practiceSection: insights.split('\n\n')[2] || ''
                  }
                : insights;

        await client.execute(saveReadingQuery, [
            userId,
            kundaliSection,
            recommendationsSection,
            practiceSection
        ], { prepare: true });

        // 4. Send response with redirect info
        res.status(201).json({ 
            message: "Profile created and reading generated successfully",
            data: { 
                userId: userId,
                redirectUrl: `/reading/${userId}`,
                user: { name, dateOfBirth, time, gender, state, city },
                reading: {
                    kundaliInsights: kundaliSection,
                    recommendations: recommendationsSection,
                    spiritualGuidance: practiceSection
                }
            }
        });

    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ 
            error: "Failed to process request",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// API endpoint to fetch reading
app.get("/api/readings/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const query = `
            SELECT * FROM spiritual_readings WHERE user_id = ?
        `;
        
        const result = await client.execute(query, [userId], { prepare: true });
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Reading not found" });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error("Error fetching reading:", err);
        res.status(500).json({ error: "Failed to fetch reading" });
    }
});

// API endpoint to list all users
app.get("/api/users", async (req, res) => {
    try {
        // Add debug logging
        console.log("Fetching all users...");

        const query = `
            SELECT id, name, date_of_birth, time_of_birth, 
                   gender, state, city, created_at 
            FROM users
        `;

        const result = await client.execute(query, [], { prepare: true });
        
        console.log(`Found ${result.rows.length} users`);

        // Format the response
        const users = result.rows.map(user => ({
            id: user.id,
            name: user.name,
            dateOfBirth: user.date_of_birth,
            timeOfBirth: user.time_of_birth,
            gender: user.gender,
            state: user.state,
            city: user.city,
            createdAt: user.created_at
        }));

        res.status(200).json(users);
    } catch (err) {
        console.error("Error fetching users:", err);
        console.error("Error details:", err.message);
        res.status(500).json({ 
            error: "Failed to fetch user data",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Add a test endpoint to verify API is working
app.get("/api/test", (req, res) => {
    res.json({ message: "API is working" });
});

// Add endpoint to get most recent user's reading
app.get("/api/latest-reading", async (req, res) => {
    try {
        console.log("Fetching most recent reading...");

        // Get all users and sort in memory (since we have a small dataset)
        const getUserQuery = `SELECT * FROM users`;
        
        console.log("Executing query:", getUserQuery);
        const userResult = await client.execute(getUserQuery);
        
        if (userResult.rows.length === 0) {
            console.log("No users found");
            return res.status(404).json({ error: "No users found" });
        }

        // Sort users by created_at in memory
        const sortedUsers = userResult.rows.sort((a, b) => 
            b.created_at.getTime() - a.created_at.getTime()
        );
        const latestUser = sortedUsers[0];
        
        console.log("Found latest user:", latestUser.name);

        // Get the reading for this user
        const readingQuery = `
            SELECT * FROM spiritual_readings 
            WHERE user_id = ?
        `;
        
        console.log("Fetching reading for user:", latestUser.id);
        const readingResult = await client.execute(readingQuery, [latestUser.id], { prepare: true });

        if (readingResult.rows.length === 0) {
            console.log("No reading found for user");
            return res.status(404).json({ error: "Reading not found" });
        }

        const reading = readingResult.rows[0];
        console.log("Found reading, sending response");

        // Format and send the response
        res.status(200).json({
            user: {
                id: latestUser.id,
                name: latestUser.name,
                dateOfBirth: latestUser.date_of_birth,
                timeOfBirth: latestUser.time_of_birth,
                gender: latestUser.gender,
                state: latestUser.state,
                city: latestUser.city,
                createdAt: latestUser.created_at
            },
            reading: {
                kundaliInsights: reading.kundali_insights,
                recommendations: reading.ai_recommendations,
                spiritualGuidance: reading.spiritual_guidance,
                createdAt: reading.created_at
            }
        });

    } catch (err) {
        console.error("Error fetching latest reading:", err);
        console.error("Error details:", err.message);
        res.status(500).json({ 
            error: "Failed to fetch latest reading",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Database connection
client.connect()
    .then(() => {
        console.log('Successfully connected to Astra DB');
        console.log('Using keyspace:', process.env.ASTRA_DB_KEYSPACE);
        return setupDatabase();
    })
    .then(() => {
        console.log("Database setup completed successfully");
        // Start server after database is ready
        startServer();
    })
    .catch(err => {
        console.error('Failed to connect to Astra DB:', err);
        console.error('Connection details:', {
            keyspace: process.env.ASTRA_DB_KEYSPACE,
            bundlePath: bundlePath,
            username: process.env.ASTRA_DB_USERNAME ? 'Set' : 'Missing'
        });
        process.exit(1);
    });

// Define server start function
const startServer = () => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV}`);
        console.log('Available endpoints:');
        console.log('- GET  /api/test');
        console.log('- GET  /api/users');
        console.log('- GET  /api/latest-reading');
        console.log('- GET  /api/readings/:userId');
        console.log('- POST /api/users');
    });
};