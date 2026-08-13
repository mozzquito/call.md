import { TRPCError } from '@trpc/server';
import { v4 as uuidv4 } from 'uuid';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import {
  RegisterInputSchema,
  RegisterOutputSchema,
  UpdateApiKeyInputSchema,
  UpdateApiKeyOutputSchema,
} from '../../../../shared/schemas/auth.schema';
import { createUser, getUserByAccessToken, updateUser } from '../../../db';
import { createVideoDBService, VideoDBService } from '../../../services/videodb.service';
import { createChildLogger } from '../../../lib/logger';
import { loadRuntimeConfig } from '../../../lib/config';

const logger = createChildLogger('auth-procedure');

export const authRouter = router({
  register: publicProcedure
    .input(RegisterInputSchema)
    .output(RegisterOutputSchema)
    .mutation(async ({ input }) => {
      const { name, apiKey } = input;

      logger.info({ name }, 'Registration attempt');

      // Verify API key with VideoDB
      const runtimeConfig = loadRuntimeConfig();
      const videodbService = createVideoDBService(apiKey, runtimeConfig.apiUrl);

      const isValid = await videodbService.verifyApiKey();

      if (!isValid) {
        logger.warn({ name }, 'Registration failed: Invalid API key');
        return {
          success: false,
          error: 'Invalid API key',
        };
      }

      // Find or create the call.md collection
      let collectionId: string;
      try {
        collectionId = await videodbService.findOrCreateCallMdCollection();
        logger.info({ collectionId }, 'Using call.md collection');
      } catch (error) {
        logger.error({ error, name }, 'Failed to setup call.md collection');
        return {
          success: false,
          error: 'Failed to setup collection. Please try again.',
        };
      }

      // Generate access token
      const accessToken = uuidv4();

      // Check if user with this token already exists (shouldn't happen with UUID)
      const existingUser = getUserByAccessToken(accessToken);
      if (existingUser) {
        logger.error({ name }, 'Token collision detected');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Token generation failed, please try again',
        });
      }

      // Create user with collection ID
      try {
        const user = createUser({
          name,
          apiKey,
          accessToken,
          collectionId,
        });

        logger.info({ userId: user.id, name, collectionId }, 'User registered successfully');

        return {
          success: true,
          // The stored column holds a hash, so hand back the token we generated.
          accessToken,
          name: user.name,
        };
      } catch (error) {
        logger.error({ error, name }, 'Failed to create user');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create user',
        });
      }
    }),

  updateApiKey: protectedProcedure
    .input(UpdateApiKeyInputSchema)
    .output(UpdateApiKeyOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { apiKey } = input;
      const userId = ctx.user.id;

      logger.info({ userId }, 'API key update attempt');

      const runtimeConfig = loadRuntimeConfig();
      const videodbService = createVideoDBService(apiKey, runtimeConfig.apiUrl);

      if (!(await videodbService.verifyApiKey())) {
        logger.warn({ userId }, 'API key update failed: Invalid API key');
        return {
          success: false,
          error: 'Invalid API key',
        };
      }

      try {
        const collectionId = await videodbService.findOrCreateCallMdCollection();
        updateUser(userId, { apiKey, collectionId });
        VideoDBService.clearCache();

        logger.info({ userId, collectionId }, 'API key updated');
        return { success: true };
      } catch (error) {
        logger.error({ error, userId }, 'Failed to update API key');
        return {
          success: false,
          error: 'Failed to update API key. Please try again.',
        };
      }
    }),
});
