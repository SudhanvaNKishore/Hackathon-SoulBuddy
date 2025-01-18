const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const axios = require("axios");

dotenv.config();

const app = express();

app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

// Create Astra DB API client
const astraDb = axios.create({
    baseURL: `https://${process.env.ASTRA_DB_URL}/api/rest/v2/namespaces/${process.env.ASTRA_DB_KEYSPACE}/collections`,
    headers: {
        'X-Cassandra-Token': process.env.ASTRA_DB_TOKEN,
        'Content-Type': 'application/json'
    }
});

// Test connection
async function testConnection() {
    try {
        await astraDb.get('/users');
        console.log('Successfully connected to Astra DB');
    } catch (err) {
        console.error('Failed to connect to Astra DB:', err.response?.data || err.message);
        process.exit(1);
    }
}

testConnection();

// API endpoint to save user data
app.post("/api/users", async (req, res) => {
    console.log("Received request body:", req.body);

    const { name, dateOfBirth, time, gender, state, city } = req.body;

    if (!name || !dateOfBirth || !time || !gender || !state || !city) {
        console.log("Missing required fields");
        return res.status(400).json({ 
            error: "All fields are required",
            received: { name, dateOfBirth, time, gender, state, city }
        });
    }

    try {
        const userData = {
            name,
            dateOfBirth,
            timeOfBirth: time,
            gender,
            state,
            city,
            createdAt: new Date().toISOString()
        };

        const response = await astraDb.post('/users', userData);
        console.log("User data saved successfully");

        res.status(201).json({ 
            message: "User profile created successfully",
            data: userData
        });

    } catch (err) {
        console.error("Database error details:", err.response?.data || err);
        res.status(500).json({ 
            error: "Failed to save user data",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// API endpoint to fetch user data
app.get("/api/users", async (req, res) => {
    try {
        const response = await astraDb.get('/users');
        res.status(200).json(response.data.data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch user data" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});
