// eslint-disable-next-line @typescript-eslint/no-var-requires
const videodb = require('videodb');
const { connect } = videodb;
type Connection = ReturnType<typeof connect>;

import path from 'path';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger('videodb-service');

interface CachedConnection {
  connection: Connection;
  apiKey: string;
}

let cachedConnection: CachedConnection | null = null;

export class VideoDBService {
  private apiKey: string;
  private baseUrl?: string;
  private collectionId?: string;

  constructor(apiKey: string, baseUrl?: string, collectionId?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.collectionId = collectionId;
  }

  /**
   * Set the collection ID to use for all operations
   */
  setCollectionId(collectionId: string): void {
    this.collectionId = collectionId;
  }

  /**
   * Get the collection ID being used
   */
  getCollectionId(): string | undefined {
    return this.collectionId;
  }

  private getConnection(): Connection {
    if (cachedConnection && cachedConnection.apiKey === this.apiKey) {
      return cachedConnection.connection;
    }

    logger.info('Creating new VideoDB connection');

    const connection = this.baseUrl
      ? connect({ apiKey: this.apiKey, baseUrl: this.baseUrl })
      : connect({ apiKey: this.apiKey });

    cachedConnection = {
      connection,
      apiKey: this.apiKey,
    };

    return connection;
  }

  async verifyApiKey(): Promise<boolean> {
    try {
      const conn = this.getConnection();
      logger.info('Attempting to verify API key by getting collection...');
      await conn.getCollection();
      logger.info('API key verified successfully');
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({
        errorMessage,
        errorStack,
        errorType: error?.constructor?.name
      }, 'API key verification failed');
      return false;
    }
  }

  /**
   * Find or create the "call.md" collection for this user.
   * Returns the collection ID.
   */
  async findOrCreateCallMdCollection(): Promise<string> {
    const conn = this.getConnection();
    const COLLECTION_NAME = 'call.md Recordings';

    logger.info('Looking for call.md collection...');

    try {
      // List all collections and find the one named "call.md"
      const collections = await conn.getCollections();

      for (const collection of collections) {
        if (collection.name === COLLECTION_NAME) {
          logger.info({ collectionId: collection.id }, 'Found existing call.md collection');
          return collection.id;
        }
      }

      // Collection not found, create it
      logger.info('call.md collection not found, creating...');
      const newCollection = await conn.createCollection(
        COLLECTION_NAME,
        'Meeting recordings from Call.md app',
        false // isPublic
      );

      logger.info({ collectionId: newCollection.id }, 'Created call.md collection');
      return newCollection.id;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ errorMessage }, 'Failed to find or create call.md collection');
      throw error;
    }
  }

  async createSessionToken(
    userId: string = 'default-user',
    expiresIn: number = 86400
  ): Promise<{
    sessionToken: string;
    expiresIn: number;
    expiresAt: number;
  }> {
    const conn = this.getConnection();

    logger.info({ userId, expiresIn }, 'Creating session token');

    // SDK signature: generateClientToken(expiresIn?: number) => Promise<string>
    const sessionToken = await conn.generateClientToken(expiresIn);

    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    return {
      sessionToken,
      expiresIn,
      expiresAt,
    };
  }

  async createCaptureSession(params: {
    endUserId: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    sessionId: string;
    collectionId: string;
    endUserId: string;
    status: string;
  }> {
    const conn = this.getConnection();

    logger.info({ endUserId: params.endUserId, collectionId: this.collectionId }, 'Creating capture session');

    // Use the configured collection ID, or fall back to default
    const collection = await conn.getCollection(this.collectionId);

    const sessionOptions: {
      endUserId: string;
      metadata?: Record<string, unknown>;
    } = {
      endUserId: params.endUserId,
    };

    if (params.metadata) {
      sessionOptions.metadata = params.metadata;
    }

    const session = await collection.createCaptureSession(sessionOptions);

    logger.info({ sessionId: session.id, collectionId: collection.id }, 'Capture session created');

    return {
      sessionId: session.id,
      collectionId: collection.id,
      endUserId: params.endUserId,
      status: 'created',
    };
  }

  async getVideo(videoId: string) {
    const conn = this.getConnection();
    const collection = await conn.getCollection(this.collectionId);
    return collection.getVideo(videoId);
  }

  async indexVideo(videoId: string): Promise<void> {
    logger.info({ videoId }, 'Indexing video for spoken words');
    const video = await this.getVideo(videoId);
    await video.indexSpokenWords();
    logger.info({ videoId }, 'Video indexed successfully');
  }

  async generateInsights(videoId: string, customPrompt?: string): Promise<string | null> {
    logger.info({ videoId, collectionId: this.collectionId }, 'Generating AI insights');
    const conn = this.getConnection();
    const collection = await conn.getCollection(this.collectionId);
    const video = await this.getVideo(videoId);

    // Fetch transcript text (like Python version)
    let transcriptText: string | null = null;
    try {
      transcriptText = await video.getTranscriptText();
    } catch (error) {
      logger.warn({ error, videoId }, 'Failed to get transcript');
    }

    // Check if transcript exists (like Python version)
    if (!transcriptText || transcriptText.trim().length === 0) {
      logger.info({ videoId }, 'No transcript available, skipping insight generation');
      return null;
    }

    // Construct the full prompt with transcript (matching Python's format exactly)
    const prompt = customPrompt || `Analyze the following meeting transcript and generate a comprehensive meeting report in markdown format.

**Output Structure:**
## 📋 Meeting Summary
A brief 2-3 sentence executive summary of the meeting.

## 🎯 Key Discussion Points
- Bullet points of the main topics discussed

## 💡 Key Decisions
- Any decisions that were made during the meeting
---

Transcript:
${transcriptText}`;

    const result = await collection.generateText(prompt, 'ultra');

    logger.info({ videoId }, 'Insights generated successfully');

    // Handle both string and object responses (like Python version)
    let generatedText: string;
    if (typeof result === 'string') {
      generatedText = result;
    } else {
      const resultObj = result as Record<string, unknown>;
      generatedText = (resultObj.output as string) ||
                      (resultObj.text as string) ||
                      ((resultObj.data as Record<string, unknown>)?.text as string) || '';
    }

    if (!generatedText) {
      logger.warn({ videoId }, 'Empty response from text generation SDK');
      return null;
    }

    return generatedText.trim();
  }

  async downloadVideo(videoId: string, name?: string): Promise<{ downloadUrl: string; name: string }> {
    logger.info({ videoId, name }, 'Getting video download URL');
    const video = await this.getVideo(videoId);
    logger.info({ videoId, streamUrl: video.streamUrl }, 'Got video object');

    const result = await video.download(name);
    logger.info({ videoId, result }, 'Download API response');

    return {
      downloadUrl: result.downloadUrl as string,
      name: result.name as string,
    };
  }

  /**
   * Upload a local file (video or audio) and generate its transcript via
   * VideoDB's batch pipeline. Unlike live capture (real-time streaming
   * transcription), this path supports languages the streaming engine
   * doesn't yet - see docs/design/2026-09-04-thai-import-secondopinion.md.
   *
   * Returns the plain transcript text - chunking it into timed segments is
   * the caller's job (import.service.ts), since VideoDB's word-level
   * timestamp shape isn't guaranteed identical between Video and Audio
   * assets and this app doesn't need exact per-word timing for an import.
   */
  async uploadAndTranscribeFile(
    filePath: string,
    languageCode?: string,
    // Fired right after the upload itself succeeds, before transcript
    // generation - the caller uses this to remember a handle capable of
    // deleting the asset, so that a failure anywhere downstream (including
    // inside this method, e.g. generateTranscript throwing) still leaves the
    // caller able to clean up the orphaned upload. A closure returned only
    // on success would be unavailable for exactly the failure modes that
    // matter most here.
    onUploaded?: (asset: { id: string; delete: () => Promise<unknown> }) => void
  ): Promise<{
    assetId: string;
    streamUrl: string | null;
    playerUrl: string | null;
    durationSeconds: number;
    fullText: string;
  }> {
    const conn = this.getConnection();
    const collection = await conn.getCollection(this.collectionId);

    logger.info({ fileName: path.basename(filePath) }, 'Uploading local file to VideoDB');
    const uploaded = await collection.uploadFile({ filePath });

    if (!uploaded) {
      throw new Error('VideoDB upload returned no asset');
    }

    // Fire onUploaded as soon as we know a real, billable asset exists on
    // VideoDB's side and can be deleted - deliberately BEFORE the
    // transcription-capability check below. That check can itself throw
    // (an unexpected asset type), and an asset already exists server-side
    // in that case too; the caller must be able to clean it up regardless
    // of which check ends up rejecting the upload.
    if ('id' in uploaded && 'delete' in uploaded) {
      onUploaded?.(uploaded as { id: string; delete: () => Promise<unknown> });
    }

    if (!('generateTranscript' in uploaded) || !('getTranscriptText' in uploaded)) {
      throw new Error('Uploaded file does not support transcription - expected a video or audio file');
    }

    // Duck-typed rather than imported from the `videodb` package's Video/Audio
    // classes directly - only the members this method actually uses, since
    // Audio assets don't expose stream/player URLs the way Video does.
    // `delete` exists on both the Video and Audio SDK classes (verified
    // against node_modules/videodb/dist/core/{video,audio}.d.ts).
    const asset = uploaded as {
      id: string;
      length: number;
      streamUrl?: string;
      playerUrl?: string;
      generateTranscript: (force?: boolean, languageCode?: string) => Promise<unknown>;
      getTranscriptText: (start?: number, end?: number) => Promise<string>;
      delete: () => Promise<unknown>;
    };
    logger.info({ assetId: asset.id }, 'Upload complete, generating transcript');

    await asset.generateTranscript(true, languageCode);
    const fullText = await asset.getTranscriptText();

    return {
      assetId: asset.id,
      streamUrl: asset.streamUrl ?? null,
      playerUrl: asset.playerUrl ?? null,
      durationSeconds: Number(asset.length) || 0,
      fullText,
    };
  }

  static clearCache(): void {
    cachedConnection = null;
    logger.info('VideoDB connection cache cleared');
  }
}

export function createVideoDBService(apiKey: string, baseUrl?: string, collectionId?: string): VideoDBService {
  return new VideoDBService(apiKey, baseUrl, collectionId);
}
