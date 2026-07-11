import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { EngagementService } from '@gitroom/nestjs-libraries/database/prisma/engagement/engagement.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class SuggestCommentTool implements AgentToolInterface {
  constructor(private _engagement: EngagementService) {}
  name = 'suggestLinkedinComment';

  run() {
    return createTool({
      id: 'suggestLinkedinComment',
      description: `Read a LinkedIn post from a profile or post URL and draft a comment in the user brand voice. Pass the LinkedIn URL. Returns the post text plus a suggested comment to rewrite before posting. LinkedIn has no personal analytics, this only reads public post text.`,
      inputSchema: z.object({
        url: z
          .string()
          .describe('A LinkedIn profile URL or a specific post URL'),
      }),
      mcp: {
        annotations: {
          title: 'Suggest LinkedIn Comment',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      outputSchema: z.object({
        postText: z.string(),
        postUrl: z.string(),
        author: z.string(),
        comment: z.string(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        return this._engagement.suggestCommentForUrl(inputData.url);
      },
    });
  }
}
