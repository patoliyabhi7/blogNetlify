require('dotenv').config();
const Imap = require('imap');
const simpleParser = require('mailparser').simpleParser;
const storeEmailModel = require('../models/storeEmailModel');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const imapConfig = {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
};

const cleanText = (text) => {
    let cleanedText = text.replace(/https?:\/\/[^\s]+/g, '');
    cleanedText = cleanedText.replace(/[<>]/g, '');
    cleanedText = cleanedText.replace(/\n{2,}/g, '\n\n').replace(/\s{2,}/g, ' ');
    cleanedText = cleanedText.trim();
    return cleanedText;
};

const convertUTCToIST = (utcDate) => {
    const date = new Date(utcDate);
    const utcTime = date.getTime();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(utcTime + istOffset);

    const year = istTime.getFullYear();
    const month = String(istTime.getMonth() + 1).padStart(2, '0');
    const day = String(istTime.getDate()).padStart(2, '0');
    const hours = String(istTime.getHours()).padStart(2, '0');
    const minutes = String(istTime.getMinutes()).padStart(2, '0');
    const seconds = String(istTime.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const fetchEmails = async () => {
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
                                // console.log('Email stored:', email.subject);
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


const createBlogFromEmails = async () => {
    const emails = await fetchFromDB();
    if (emails.length === 0) {
        console.log("No emails found for today.");
        return;
    }

    // Concatenate subjects and bodies with a special symbol
    const combinedContent = emails.map(email => `Title: ${email.subject} ### Body: ${email.body} ||| `).join("\n\n");

    // Generate blog content
    const blogContent = await geminiAI(combinedContent);
}

module.exports = { fetchEmails, createBlogFromEmails, geminiAI, fetchFromDB };