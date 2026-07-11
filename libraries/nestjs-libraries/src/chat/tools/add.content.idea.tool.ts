import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { EngagementService } from '@gitroom/nestjs-libraries/database/prisma/engagement/engagement.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class AddContentIdeaTool implements AgentToolInterface {
  constructor(private _engagement: EngagementService) {}
  name = 'addContentIdea';

  run() {
    return createTool({
      id: 'addContentIdea',
      description: `Save a content idea to the user idea bank (stored in Postiz). Use when the user says add this to my idea bank. Pass the idea text and an optional note or source.`,
      inputSchema: z.object({
        idea: z.string().describe('The content idea to save'),
        note: z.string().optional().describe('Optional extra note or angle'),
        source: z
          .string()
          .optional()
          .describe('Optional source, e.g. a URL or where it came from'),
        tags: z
          .array(z.string())
          .optional()
          .describe('Optional tags/categories for the idea'),
      }),
      mcp: {
        annotations: {
          title: 'Add Content Idea',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        id: z.string(),
        idea: z.string(),
        createdAt: z.string(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;
        const saved = await this._engagement.addContentIdea(
          organizationId,
          inputData.idea,
          inputData.note,
          inputData.source,
          inputData.tags
        );
        return {
          id: saved.id,
          idea: saved.idea,
          createdAt: saved.createdAt.toISOString(),
        };
      },
    });
  }
}
