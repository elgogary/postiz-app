import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { EngagementService } from '@gitroom/nestjs-libraries/database/prisma/engagement/engagement.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class ListContentIdeasTool implements AgentToolInterface {
  constructor(private _engagement: EngagementService) {}
  name = 'listContentIdeas';

  run() {
    return createTool({
      id: 'listContentIdeas',
      description: `List the most recent content ideas saved in the user idea bank.`,
      inputSchema: z.object({}),
      mcp: {
        annotations: {
          title: 'List Content Ideas',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        output: z.array(
          z.object({
            id: z.string(),
            idea: z.string(),
            note: z.string().nullable(),
            createdAt: z.string(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;
        const ideas = await this._engagement.listContentIdeas(organizationId);
        return {
          output: ideas.map((i: any) => ({
            id: i.id,
            idea: i.idea,
            note: i.note || null,
            createdAt: i.createdAt.toISOString(),
          })),
        };
      },
    });
  }
}
