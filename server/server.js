
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const uploadDir = path.join(process.cwd(), 'uploads');
const VIDEO_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const VIDEO_FPS = 0.5;

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

await fs.mkdir(uploadDir, { recursive: true });

const allowedTypes = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/mpeg',
  'video/x-flv',
  'video/x-ms-wmv',
  'video/3gpp',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDir);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    callback(
      null,
      `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`,
    );
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(
        new Error(
          'Unsupported video format. Please use MP4, WebM, MOV, AVI, or another supported video format.',
        ),
      );
    }

    callback(null, true);
  },
});

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  }),
);

app.use(express.json({ limit: '1mb' }));

const studyPrompt = `
You are Recapify, an expert lecture study assistant.
Analyze the provided lecture and create a useful study kit for a college student.

Return valid JSON only, with this structure:
{
  "title": "A short lecture title",
  "summary": "A clear summary of the lecture",
  "notes": [
    {
      "heading": "Topic heading",
      "content": "Detailed but easy-to-understand notes",
      "timestamp": "A timestamp such as 02:15, or null if unavailable"
    }
  ],
  "flashcards": [
    {
      "question": "A useful revision question",
      "answer": "A clear answer"
    }
  ],
  "quiz": [
    {
      "question": "A multiple-choice question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "The exact correct option",
      "explanation": "Why that answer is correct"
    }
  ]
}

Include 5-10 note sections, 8 flashcards, and 5 quiz questions
when the lecture provides enough content.
Use accurate timestamps only when identifiable. Never invent timestamps.
Keep explanations beginner-friendly.
Do not add facts that contradict the lecture.
`;

function getErrorStatus(error) {
  const status = Number(error?.status ?? error?.statusCode);

  if ([400, 401, 403, 404, 429].includes(status)) {
    return status;
  }

  const message = String(error?.message || '');

  if (/quota|resource_exhausted|rate.?limit|\b429\b/i.test(message)) {
    return 429;
  }

  if (/timed?\s*out|timeout|deadline exceeded/i.test(message)) {
    return 504;
  }

  if (/token.*limit|input.*too long|context.*length/i.test(message)) {
    return 413;
  }

  return 502;
}

function getPublicErrorMessage(error) {
  const status = getErrorStatus(error);
  const message = String(error?.message || '');

  if (status === 429) {
    return 'Gemini quota or rate limit reached. Check your Google AI Studio usage and retry when your free quota resets.';
  }

  if (status === 401 || status === 403) {
    return 'Gemini authentication or model access failed. Check your API key, project, and model access.';
  }

  if (status === 413) {
    return 'This video is too large for a single request. Try a shorter lecture; longer-video segmentation is needed for this input.';
  }

  if (status === 404 || /model.*not found|not supported/i.test(message)) {
    return 'The selected Gemini model is unavailable or does not support this request. Check the model name and access.';
  }

  if (status === 504) {
    return 'Gemini took too long to respond. Please try again.';
  }

  if (/API key is not configured/i.test(message)) {
    return 'Gemini API key is missing. Check the server/.env file.';
  }

  return 'Could not generate the study kit. Check the video URL and the server terminal for details.';
}

function sendApiError(res, error, context) {
  const status = getErrorStatus(error);

  console.error(`${context}:`, error?.message || error);

  return res.status(status).json({
    success: false,
    error: getPublicErrorMessage(error),
  });
}

async function createStudyKit(videoInput) {
  if (!ai) {
    throw new Error('Gemini API key is not configured.');
  }

  const response = await ai.interactions.create({
    model: MODEL,
    input: [
      {
        ...videoInput,
        processing: {
          type: 'static',
          fps: VIDEO_FPS,
        },
      },
      {
        type: 'text',
        text: studyPrompt,
      },
    ],
  });

  const result = response.output_text;

  if (!result || !result.trim()) {
    throw new Error('Gemini returned an empty study kit.');
  }

  // Validate that Gemini returned JSON before sending it to the frontend.
  const jsonStart = result.indexOf('{');
  const jsonEnd = result.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    throw new Error('Gemini did not return valid JSON for the study kit.');
  }

  const jsonText = result.slice(jsonStart, jsonEnd + 1);
  JSON.parse(jsonText);

  return jsonText;
}

app.get('/', (_req, res) => {
  res.json({
    message: 'Welcome to the Recapify API!',
    status: 'running',
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    app: 'Recapify',
    geminiConfigured: Boolean(ai),
    model: MODEL,
  });
});

// Test the Gemini connection.
app.post('/api/ai/test', async (req, res) => {
  try {
    if (!ai) {
      return res.status(503).json({
        success: false,
        error: 'Gemini API key is not configured. Check server/.env.',
      });
    }

    const prompt = req.body?.prompt;

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a prompt.',
      });
    }

    if (prompt.length > 3000) {
      return res.status(400).json({
        success: false,
        error: 'Prompt must be 3000 characters or less.',
      });
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt.trim(),
    });

    return res.json({
      success: true,
      result: response.text ?? '',
    });
  } catch (error) {
    return sendApiError(res, error, 'AI test failed');
  }
});

// Analyze a public YouTube lecture.
app.post('/api/lectures/youtube', async (req, res) => {
  try {
    if (!ai) {
      return res.status(503).json({
        success: false,
        error: 'Gemini API key is not configured. Check server/.env.',
      });
    }

    const { url } = req.body ?? {};

    if (typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a YouTube URL.',
      });
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return res.status(400).json({
        success: false,
        error: 'That URL is not valid.',
      });
    }

    const host = parsedUrl.hostname.toLowerCase();

    const isYouTube =
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtu.be';

    if (parsedUrl.protocol !== 'https:' || !isYouTube) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid HTTPS YouTube link.',
      });
    }

    console.log(`Starting YouTube analysis with ${MODEL} at ${VIDEO_FPS} FPS...`);

    const result = await createStudyKit({
      type: 'video',
      uri: parsedUrl.toString(),
    });

    console.log('YouTube study kit generated successfully.');

    return res.json({
      success: true,
      source: 'youtube',
      result,
    });
  } catch (error) {
    return sendApiError(res, error, 'YouTube processing failed');
  }
});

// Upload and analyze a lecture video.
app.post(
  '/api/lectures/upload',
  (req, res, next) => {
    upload.single('video')(req, res, (error) => {
      if (error) {
        const status =
          error instanceof multer.MulterError ? 400 : 415;

        return res.status(status).json({
          success: false,
          error: error.message,
        });
      }

      next();
    });
  },
  async (req, res) => {
    let uploadedFile;
    let geminiFileName;

    try {
      if (!ai) {
        return res.status(503).json({
          success: false,
          error: 'Gemini API key is not configured. Check server/.env.',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Choose a video file first.',
        });
      }

      uploadedFile = req.file.path;

      console.log(`Uploading video: ${req.file.originalname}`);

      const geminiFile = await ai.files.upload({
        file: uploadedFile,
        config: {
          mimeType: req.file.mimetype,
        },
      });

      geminiFileName = geminiFile.name;

      if (!geminiFileName) {
        throw new Error('Gemini did not return an uploaded file name.');
      }

      const deadline = Date.now() + VIDEO_PROCESSING_TIMEOUT_MS;

      let fileStatus = await ai.files.get({
        name: geminiFileName,
      });

      while (fileStatus.state === 'PROCESSING') {
        if (Date.now() >= deadline) {
          throw new Error('Video processing timed out. Try a shorter video.');
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));

        fileStatus = await ai.files.get({
          name: geminiFileName,
        });
      }

      if (fileStatus.state !== 'ACTIVE') {
        throw new Error(
          `Gemini could not process the uploaded video. State: ${fileStatus.state}`,
        );
      }

      console.log(`Generating uploaded-video study kit with ${MODEL}...`);

      const result = await createStudyKit({
        type: 'video',
        uri: fileStatus.uri,
        mime_type: fileStatus.mimeType,
      });

      console.log('Uploaded video study kit generated successfully.');

      return res.json({
        success: true,
        source: 'upload',
        result,
      });
    } catch (error) {
      return sendApiError(res, error, 'Video upload processing failed');
    } finally {
      if (uploadedFile) {
        await fs.unlink(uploadedFile).catch(() => {});
      }

      if (geminiFileName && ai) {
        try {
          await ai.files.delete({
            name: geminiFileName,
          });
        } catch (error) {
          console.error(
            'Could not delete temporary Gemini file:',
            error.message,
          );
        }
      }
    }
  },
);

// Handle unexpected Express errors.
app.use((error, _req, res, _next) => {
  console.error('Server error:', error.message);

  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Recapify API running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Gemini model: ${MODEL}`);
});
