const { schedule } = require('@netlify/functions');
require('dotenv').config();
const Imap = require('imap');
const simpleParser = require('mailparser').simpleParser;
const { GoogleGenerativeAI } = require("@google/generative-ai");

const storeEmailModel = require('../../models/storeEmailModel');
const Blog = require('./../../models/storeBlogsModel');
const ImageUsage = require('./../../models/imageUsageModel');

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

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// fetch emails from database and store it in array
const fetchFromDB = async () => {
    try {
        const emails = await storeEmailModel.find({ currentDate: new Date().toJSON().slice(0, 10) });
        return emails;
    } catch (error) {
        console.log(error);
        return [];
    }
}


const geminiAI = async (combinedContent) => {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Task: You are an AI assistant tasked with creating a single, cohesive blog post from multiple pieces of content.

    Please summarize and combine the content into one blog post, ensuring that important information from all sources is preserved while removing any links and copyright details.
    
    Specifics:
    1. The input content is made up of multiple titles and bodies. 
    2. Each title is separated from its body by the symbol "###".
    3. Different title-body pairs are separated by the symbol "|||".
    4. Create a single, unified blog post that combines information from all provided title-body pairs.
    5. Generate one attractive and encompassing title for the entire blog post.
    6. Summarize the content concisely and uniquely, making the overall blog post engaging and informative.
    7. Remove all links and any copyright-related information from the content.
    8. The blog post should be written in a professional and engaging style.
    9. The summary should be engaging and informative, making readers want to read more.
    10. The blog should be in paragraph form, with a clear structure and flow.
    11. Title should be unqiuely indentified such as Title:title here and then body as Body:body here.
    12. **Output the blog post in valid tailwind classes format**, using tags like <h1> for the title and <p> for the paragraphs, add multiple subheadings according to the content, replace <h1> and other heading tags with relevant tailwind classes as that heading tags won't be effective,so that it can be directly posted.
    13. Divide the blog in two different div tags, first div tag should contain title and id="blog-title" and second div tag should contain body and id="blog-body".
    
    Content starts from below:
    ${combinedContent}`;

    const result = await model.generateContent([prompt]);
    const blogContent = result.response.text();

    // Generate image prompt
    const imagePrompt = `Based on the following blog content, generate a brief description for an image that would be suitable as a featured image for this blog post:

  ${blogContent}

  Provide a concise description in 1-2 sentences.`;

    const imageResult = await model.generateContent(imagePrompt);
    const imageDescription = imageResult.response.text();

    return { blogContent, imageDescription };
}

// fetching email cron-job
exports.handler = schedule('5 11 * * *', async (event, context) => {
    const imap = new Imap(imapConfig);

    imap.once('ready', () => {
        imap.openBox('INBOX', false, (err, box) => {
            if (err) {
                console.error('Error opening inbox:', err);
                imap.end();
                return;
            }

            const allowedEmails = [
                'therundownai@mail.beehiiv.com',
                'theneuron@newsletter.theneurondaily.com',
                'dan@tldrnewsletter.com',
                'hello@faveeo.com',
                'bensbites@mail.bensbites.co',
                'hello@mindstream.news',
                'importai@substack.com',
                'aibreakfast@mail.beehiiv.com'
            ];

            imap.search(['ALL'], (err, results) => {
                if (err) {
                    console.error('Error searching emails:', err);
                    imap.end();
                    return;
                }

                if (!results || !results.length) {
                    console.log('No emails found.');
                    imap.end();
                    return;
                }

                const f = imap.fetch(results, { bodies: [''], struct: true });

                f.on('message', (msg) => {
                    msg.on('body', (stream, info) => {
                        let buffer = '';
                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8');
                        });
                        stream.once('end', async () => {
                            try {
                                const parsed = await simpleParser(buffer);
                                const { subject, date, from, text } = parsed;
                                const cleanedTextBody = cleanText(text);
                                const istDate = convertUTCToIST(date);

                                // Log the email date in both UTC and IST

                                // Check if the email is from the allowed addresses
                                if (!allowedEmails.includes(from.value[0].address)) {
                                    return;
                                }

                                // Calculate the date and time range
                                const now = new Date();
                                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                const yesterday = new Date(today);
                                yesterday.setDate(today.getDate() - 1);

                                const startTime = new Date(yesterday);
                                startTime.setHours(19, 30, 0, 0); // 2 PM yesterday
                                // console.log('Start Time:', startTime);

                                const endTime = new Date(today);
                                endTime.setHours(19, 0, 0, 0); // 1 PM today
                                // console.log('End Time:', endTime);

                                // Check if the email was received within the specified range
                                const emailDate = new Date(istDate);
                                // console.log('Email Date:', emailDate);
                                if (emailDate < startTime || emailDate >= endTime) {
                                    return;
                                }

                                // check if the email is already stored
                                const emailExists = await storeEmailModel.findOne({ subject });
                                if (emailExists) {
                                    // console.log('Email already stored:', emailExists.subject);
                                    return;
                                }

                                // Store the email in the database
                                const email = await storeEmailModel.create({
                                    subject,
                                    from: from.text,
                                    currentDate: new Date().toJSON().slice(0, 10),
                                    receivedDateTime: istDate,
                                    body: cleanedTextBody,
                                });
                                console.log('Email stored:', email.subject);
                            } catch (err) {
                                console.error('Error parsing or storing email:', err);
                            }
                        });
                    });
                });

                f.once('error', (ex) => {
                    console.error('Fetch error:', ex);
                });

                f.once('end', () => {
                    console.log('Finished fetching the last email');
                    imap.end();
                });
            });
        });
    });

    imap.once('error', (err) => {
        console.error('IMAP connection error:', err);
    });

    imap.once('end', () => {
        console.log('IMAP connection ended');
    });

    imap.connect();
});


// Generate blog content from fetched emails cron-job
exports.handler = schedule('*/2 3-5 * * *', async (event, context) => {
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
        console.log("Generated blog title:", title);

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
})