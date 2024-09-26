const express = require('express');
const router = express.Router();
const { fetchFromDB, geminiAI } = require('../controller/readEmails'); // Adjust the path
const Blog = require('./../models/storeBlogsModel');
const ImageUsage = require('./../models/imageUsageModel');
const cloudinary = require('cloudinary').v2;

// run this as a cron job to generate blog content few minutes before the blog is published
const cloudinaryUrls = [
    'https://res.cloudinary.com/dgll8hgx0/image/upload/v1726224389/da7cc1a9-a249-49b0-9ae7-61df59a0b54c_n6yxia.jpg',
    'https://res.cloudinary.com/dgll8hgx0/image/upload/v1726224383/a4f64335-1642-4195-9427-9357ac06b2e9_mnymss.jpg',
    'https://res.cloudinary.com/dgll8hgx0/image/upload/v1726224142/aaf33178-6438-4395-9a75-d471ec7e9453_o5w3gx.png',
    'https://res.cloudinary.com/dgll8hgx0/image/upload/v1726224044/638f88dc-5f4b-4816-a383-5934be150afa_a9nem7.png',
    'https://res.cloudinary.com/dgll8hgx0/image/upload/v1726224037/cff632b0-f728-4d53-9828-10746213b324_huuawc.jpg',
    'https://res.cloudinary.com/dgll8hgx0/image/upload/v1726223922/2f51344d-ca6d-4b0b-9708-5f97849a1983_crlfgv.png',
    'https://res.cloudinary.com/dgll8hgx0/image/upload/v1726223688/2c6cf723-7d75-48d0-80a0-faf26a74e570_eyv790.webp',
    'https://res.cloudinary.com/dgll8hgx0/image/upload/v1726223852/d75638f7-f202-4b4a-b4b6-5f640d983904_mlxxgu.jpg',
    'https://res.cloudinary.com/dgll8hgx0/image/upload/v1726223762/943ab3c8-d331-4694-8a6f-40db9c6b3e63_wthv14.jpg',
    'https://res.cloudinary.com/dgll8hgx0/image/upload/v1726223692/5543de72-c163-4c6a-833f-d5a745ff7c0c_yupsnv.webp',
    'https://res.cloudinary.com/dgll8hgx0/image/upload/v1726223651/1600e678-096a-45be-88b9-462df95185e3_szq86u.png',
    'https://res.cloudinary.com/dgll8hgx0/image/upload/v1726223564/d1e28206-5e36-42be-8636-96803526f07d_blex6r.png'
];

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

router.get('/generateBlog', async (req, res) => {
    try {
        const emails = await fetchFromDB();
        if (emails.length === 0) {
            return res.status(404).json({ message: "No emails found for today." });
        }

        const combinedContent = emails.map(email => `Title: ${email.subject} ### Body: ${email.body} ||| `).join("\n\n");
        
        // Destructure the returned object to get blogContent
        const { blogContent } = await geminiAI(combinedContent);

        // Ensure blogContent is a string before using match
        if (typeof blogContent !== 'string') {
            throw new Error("Invalid blog content format.");
        }

        // Update the regex to match the new format with Tailwind classes and div tags
        const titleMatch = blogContent.match(/<div id="blog-title"[^>]*>(.*?)<\/div>/s);
        const bodyMatch = blogContent.match(/<div id="blog-body"[^>]*>([\s\S]*?)<\/div>/s);

        const title = titleMatch ? titleMatch[1].trim() : "No Title Found";
        const body = bodyMatch ? bodyMatch[1].trim() : "No Body Found";

        let usageRecord = await ImageUsage.findOne({});
        if (!usageRecord) {
            usageRecord = await ImageUsage.create({ currentIndex: 0, usedIndexes: [] });
        }

        if (usageRecord.usedIndexes.length === cloudinaryUrls.length) {
            usageRecord.usedIndexes = [];
        }

        let availableIndexes = cloudinaryUrls.map((_, index) => index).filter(index => !usageRecord.usedIndexes.includes(index));
        if (availableIndexes.length === 0) {
            availableIndexes = cloudinaryUrls.map((_, index) => index);
            shuffleArray(availableIndexes);
        }

        const randomIndex = availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
        const imageURL = cloudinaryUrls[randomIndex];

        await Blog.create({ title, body, imageURL });

        usageRecord.usedIndexes.push(randomIndex);
        await ImageUsage.updateOne({}, { $set: { usedIndexes: usageRecord.usedIndexes } });

        res.status(200).json({
            title,
            body,
            imageURL
        });
    } catch (error) {
        console.error("Error generating blog content:", error);
        res.status(500).json({ message: "Error generating blog content." });
    }
});


// API route to fetch all blogs
router.get('/blog', async (req, res) => {
    try {
        const blogs = await Blog.find();
        res.status(200).json(blogs);
    } catch (error) {
        console.error("Error fetching blogs:", error);
        res.status(500).json({ message: "Error fetching blogs." });
    }
});

// API route to fetch a specific blog
router.get('/blog/:id', async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ message: "Blog not found." });
        }

        res.status(200).json(blog);
    } catch (error) {
        console.error("Error fetching blog:", error);
        res.status(500).json({ message: "Error fetching blog." });
    }
});





// API route to fetch all blogs
// router.get('/blog', async (req, res) => {
//     try {
//         // const blogs = await Blog.find();
//         const response = await fetch("https://github.com/patoliyabhi7/BlogWebsite/blob/main/07reactrouter/blogContent.json")
//         const data = await response.json();
//         console.log()
//         res.status(200).json(blogs);
//     } catch (error) {
//         console.error("Error fetching blogs:", error);
//         res.status(500).json({ message: "Error fetching blogs." });
//     }
// });

// uncommet below for github
// (async () => {
//     const fetch = (await import('node-fetch')).default;


//     router.get('/blog', async (req, res) => {
//         try {
//             const response = await fetch("https://raw.githubusercontent.com/patoliyabhi7/BlogWebsite/main/07reactrouter/blogContent.json");
//             if (!response.ok) {
//                 throw new Error(`HTTP error! status: ${response.status}`);
//             }

//             const blogs = await response.json();
//             res.status(200).json(blogs);
//         } catch (error) {
//             console.error("Error fetching blogs:", error);
//             res.status(500).json({ message: "Error fetching blogs." });
//         }
//     });

//     module.exports = router;
// })();

// API route to fetch a specific blog
// router.get('/blog/:id', async (req, res) => {
//     try {
//         const blog = await Blog.findById(req.params.id);

//         if (!blog) {
//             return res.status(404).json({ message: "Blog not found." });
//         }

//         res.status(200).json(blog);
//     } catch (error) {
//         console.error("Error fetching blog:", error);
//         res.status(500).json({ message: "Error fetching blog." });
//     }
// });

module.exports = router;