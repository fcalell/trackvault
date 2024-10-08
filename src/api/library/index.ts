import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { db } from '@/db'
import { library } from '@/db/schema/library'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import differenceWith from 'lodash/differenceWith'
import mean from 'lodash/mean'
import { parseFile } from 'music-metadata'
import NodeID3 from 'node-id3'
import { z } from 'zod'
import { getConfig } from '../config'
import server from '../server'

const readdir = promisify(fs.readdir)
const unlink = promisify(fs.unlink)

export default server.router({
  getLocal: server.procedure.query(async () => {
    const { localLibraryPath } = await getConfig()
    if (!localLibraryPath) throw new TRPCError({ code: 'PRECONDITION_FAILED' })

    const localFiles = await readdir(localLibraryPath, { recursive: true }).then((files) =>
      files.filter((file): file is string => {
        return typeof file === 'string' && path.extname(file) === '.mp3'
      })
    )
    const dbFiles = await db.select().from(library)

    const filesNotInDb = differenceWith(
      localFiles,
      dbFiles,
      (localFile, dbFile) => `${localLibraryPath}/${localFile}` === dbFile.filepath
    )

    const fileList = dbFiles
    const filesToInsert: typeof dbFiles = []
    for (const file of filesNotInDb) {
      const filepath = path.join(localLibraryPath, file)
      const { format } = await parseFile(filepath, { skipCovers: true })
      const tags = NodeID3.read(filepath, { noRaw: true })
      const outputMeta = {
        id: randomUUID(),
        title: tags.title ?? null,
        artist: tags.artist ?? null,
        album: tags.album ?? null,
        genre: tags.genre ?? null,
        year: tags.year ? Number.parseInt(tags.year, 10) : null,
        comment: tags.comment?.text ?? null,
        // Techincal params
        bitrate: (format.bitrate && Math.round(format.bitrate / 1000)) ?? null,
        duration: format.duration ?? null,
        filepath: `${localLibraryPath}/${file}`,
        filename: file.split('/').pop() ?? null,
      }
      fileList.push(outputMeta)
      filesToInsert.push(outputMeta)
    }

    if (filesToInsert.length > 0) {
      await db.insert(library).values(filesToInsert)
    }
    return { fileList }
  }),
  deleteFile: server.procedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    try {
      // Get the file information
      const files = await db.select().from(library).where(eq(library.id, input.id)).limit(1)
      const file = files[0]
      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found in the database',
        })
      }

      if (file.filepath) {
        // Delete the file from the filesystem
        await unlink(file.filepath)
      }

      // Delete the file from the database
      await db.delete(library).where(eq(library.id, input.id))

      return { success: true, message: 'File deleted successfully' }
    } catch (error) {
      console.error('Error deleting file:', error)
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while deleting the file',
      })
    }
  }),
  findDuplicates: server.procedure
    .input(
      z.object({
        probability: z.number().min(0).max(1),
        matchTags: z.boolean(),
        matchFilename: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      function compareTwoStrings(a: string, b: string) {
        const first = a.replace(/[^A-Z0-9]+/gi, '')
        const second = b.replace(/[^A-Z0-9]+/gi, '')

        if (first === second) return 1 // identical or empty
        if (first.length < 2 || second.length < 2) return 0 // if either is a 0-letter or 1-letter string

        const firstBigrams = new Map()
        for (let i = 0; i < first.length - 1; i++) {
          const bigram = first.substring(i, i + 2)
          const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) + 1 : 1

          firstBigrams.set(bigram, count)
        }

        let intersectionSize = 0
        for (let i = 0; i < second.length - 1; i++) {
          const bigram = second.substring(i, i + 2)
          const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) : 0

          if (count > 0) {
            firstBigrams.set(bigram, count - 1)
            intersectionSize++
          }
        }

        return (2.0 * intersectionSize) / (first.length + second.length - 2)
      }
      const files = await db.select().from(library)
      const calculateSimilarity = (
        file1: (typeof files)[number],
        file2: (typeof files)[number]
      ) => {
        const similarities = []

        if (input.matchTags) {
          if (file1.title && file2.title) {
            similarities.push(compareTwoStrings(file1.title, file2.title))
          }
          if (file1.artist && file2.artist) {
            similarities.push(compareTwoStrings(file1.artist, file2.artist))
          }
        }
        if (input.matchFilename && file1.filename && file2.filename) {
          similarities.push(compareTwoStrings(file1.filename, file2.filename))
        }
        return similarities.length > 0 ? mean(similarities) : 0
      }
      const duplicateGroups: (typeof files)[] = []
      const processedIds = new Set<string>()

      for (let i = 0; i < files.length; i++) {
        if (processedIds.has(files[i].id)) continue

        const group = [files[i]]
        processedIds.add(files[i].id)

        for (let j = i + 1; j < files.length; j++) {
          if (processedIds.has(files[j].id)) continue

          const similarity = calculateSimilarity(files[i], files[j])
          if (similarity >= input.probability) {
            group.push(files[j])
            processedIds.add(files[j].id)
          }
        }

        if (group.length > 1) {
          duplicateGroups.push(group)
        }
      }
      return { duplicateGroups }
    }),
})
