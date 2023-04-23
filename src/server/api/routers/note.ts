import { NotePermission, PrismaClient } from "@prisma/client";
import { z } from "zod";

import {
    createTRPCRouter,
    protectedProcedure,
    publicProcedure,
} from "~/server/api/trpc";

const getAuthorizedNote = async (prisma: PrismaClient, noteId: string, userId: string, checkSharedPermissions?: NotePermission[]) => {
    const targetNote = await prisma.note.findUniqueOrThrow({
        where: {
            id: noteId
        }
    });

    // bypassing the owner check if the permission is shared
    if (checkSharedPermissions) {
        const checkPassed = checkSharedPermissions.reduce(
            (isPassing, checkPermission) => isPassing && targetNote?.sharedPermissions.includes(checkPermission) ,
            true
        )
        
        if (checkPassed) {
            return targetNote;
        }
    }

    if (userId !== targetNote.userId) {

        throw new Error("Unauthorized")
    }

    return targetNote;
}

export const noteRouter = createTRPCRouter({
    upsert: protectedProcedure
        .input(z.object({
            noteId: z.string().optional(),
            title: z.string().min(2).max(24),
            content: z.string().max(400),
            tags: z.string().array(),
            sharedPermissions: z.nativeEnum(NotePermission).array().optional()
        }))
        .mutation(async ({ input, ctx }) => {
            if (input.noteId) {
                await getAuthorizedNote(ctx.prisma, input.noteId, ctx.session.user.id, ["EDIT"]);
            }

            return ctx.prisma.note.upsert({
                create: {
                    title: input.title,
                    content: input.content,
                    userId: ctx.session.user.id,
                    tags: {
                        create: input.tags.map(tag => ({
                            tag: {
                                connectOrCreate: {
                                    create: {
                                        userId: ctx.session.user.id,
                                        name: tag,
                                    },
                                    where: {
                                        userId_name: {
                                            userId: ctx.session.user.id,
                                            name: tag,
                                        }
                                    }
                                }
                            }
                        }))
                    },
                },
                update: {
                    title: input.title,
                    content: input.content,
                    userId: ctx.session.user.id,
                    sharedPermissions: input.sharedPermissions,
                    tags: {
                        deleteMany: {},
                        connectOrCreate: input.tags.map(tag => ({
                            create: {
                                tag: {
                                    connectOrCreate: {
                                        create: {
                                            userId: ctx.session.user.id,
                                            name: tag,
                                        },
                                        where: {
                                            userId_name: {
                                                userId: ctx.session.user.id,
                                                name: tag,
                                            }
                                        }
                                    }
                                }
                            },
                            where: {
                                noteId_userId_name: {
                                    noteId: input.noteId || "",
                                    userId: ctx.session.user.id,
                                    name: tag,
                                }
                            }
                        }))
                    },
                },
                where: {
                    id: input.noteId || ""
                }
            });
        }),
    getWithCursor: publicProcedure
        .input(z.object({
            limit: z.number(),
            cursor: z.string().nullish(),
            searchValue: z.string().nonempty().optional(),
            tags: z.string().array().optional(),
            sortBy: z.enum(["TITLE", "DATE"]).optional(),
            archivedPosts: z.boolean().optional(),
        }))
        .query(async ({ input, ctx }) => {
            const notes = await ctx.prisma.note.findMany({
                take: input.limit + 1,
                cursor: input.cursor ? { id: input.cursor } : undefined,

                orderBy: {
                    ...(
                        input.sortBy === "TITLE" ? {
                            title: 'asc'
                        } : {
                            createdAt: 'desc'
                        }
                    )

                },
                include: {
                    tags: true
                },
                where: {
                    AND: {
                        archived: !!input.archivedPosts,
                        ...(input.searchValue ? {
                            OR: [
                                { title: { contains: input.searchValue, mode: "insensitive" } },
                                { content: { contains: input.searchValue, mode: "insensitive" } },
                            ]
                        } : {}),
                        ...(input.tags ? {
                            tags: {
                                some: {
                                    OR: input.tags?.map(tag => ({
                                        name: tag
                                    }))
                                }
                            }
                        } : {}),
                    },
                }
                ,
            });

            let nextCursor: typeof input.cursor = undefined;

            if (notes.length > input.limit) {
                const nextNote = notes.pop(); // return the last item from the array
                nextCursor = nextNote?.id;
            }

            return {
                notes,
                nextCursor,
            };
        }),
    getById: publicProcedure
        .input(z.object({
            noteId: z.string().optional()
        }))
        .query(async ({ input, ctx }) => {
            if (input.noteId) {
                return await ctx.prisma.note.findUnique({
                    where: {
                        id: input.noteId
                    },
                    include: {
                        tags: true,
                    }
                })
            }

            return null;
        }),
    delete: protectedProcedure
        .input(z.object({
            noteId: z.string()
        }))
        .mutation(async ({ input, ctx }) => {
            await getAuthorizedNote(ctx.prisma, input.noteId, ctx.session.user.id, ["DELETE"]);

            return ctx.prisma.note.delete({
                where: {
                    id: input.noteId
                }
            })
        }),
    switchArchiveStatus: protectedProcedure
        .input(z.object({
            noteId: z.string()
        }))
        .mutation(async ({ input, ctx }) => {
            const targetNote = await getAuthorizedNote(ctx.prisma, input.noteId, ctx.session.user.id, ["ARCHIVE"]);

            return ctx.prisma.note.update({
                data: {
                    archived: !targetNote.archived
                },
                where: {
                    id: input.noteId
                }
            })
        }),
});