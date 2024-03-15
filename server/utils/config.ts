import crypto from 'node:crypto'
import yaml from 'yaml'
import defu from 'defu'
import { ZodError, z } from 'zod'
import type { CompleteConfig, Service, Tag } from '~/types'

type DraftService = Omit<Service, 'id'>

type TagMap = Map<Tag['name'], Tag>

function determineService(items: DraftService[], tags: TagMap): Service[] {
  return items.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    tags: (item.tags || []).map((tag): Tag => {
      if (typeof tag === 'string') {
        return tags.get(tag) || {
          name: tag,
          color: 'blue',
        }
      }

      return tag
    }),
  }))
}

export function getDefaultConfig(): CompleteConfig {
  return {
    title: 'Mafl Home Page',
    lang: 'en',
    theme: 'system',
    checkUpdates: true,
    behaviour: {
      target: '_blank',
    },
    tags: [],
    services: [],
  }
}

export function validateConfigSchema(config: any) {
  const status = z.object({
    enabled: z.boolean().optional(),
    interval: z.number().optional(),
  })

  const icon = z.object({
    url: z.string().optional(),
    name: z.string().optional(),
    wrap: z.boolean().optional(),
    background: z.string().optional(),
    color: z.string().optional(),
  })

  const tag = z.object({
    name: z.string(),
    color: z.string(),
  })

  const service = z.object({
    title: z.string().nullish().optional(),
    description: z.string().nullish().optional(),
    link: z.string().nullish().optional(),
    target: z.string().optional(),
    icon: icon.optional(),
    status: status.optional(),
    type: z.string().optional(),
    options: z.record(z.any()).optional(),
    secrets: z.record(z.any()).optional(),
  })

  const schema = z.object({
    title: z.string().optional(),
    lang: z.string().optional(),
    theme: z.string().optional(),
    checkUpdates: z.boolean().optional(),
    tags: z.array(tag).optional(),
    services: z.union([
      z.array(service),
      z.record(z.array(service)),
    ]),
  })

  return schema.parse(config)
}

function createTagMap(tags: Tag[]): TagMap {
  return tags.reduce((acc, tag) => {
    acc.set(tag.name, tag)

    return acc
  }, new Map())
}

export async function loadLocalConfig(): Promise<CompleteConfig> {
  const defaultConfig = getDefaultConfig()
  const storage = useStorage('data')
  const file = 'config.yml'

  try {
    if (!await storage.hasItem(file)) {
      throw new Error('Config not found')
    }

    const raw = await storage.getItem<string>(file)
    const config = yaml.parse(raw || '') || {}
    const services: CompleteConfig['services'] = []
    const tags: TagMap = createTagMap(config.tags || [])

    validateConfigSchema(config)

    if (Array.isArray(config.services)) {
      services.push({
        items: determineService(config.services, tags),
      })
    } else {
      const entries = Object.entries<DraftService[]>(config.services || [])

      for (const [title, items] of entries) {
        services.push({
          title,
          items: determineService(items, tags),
        })
      }
    }

    return defu({ ...config, services }, defaultConfig)
  } catch (e) {
    logger.error(e)

    if (e instanceof Error) {
      defaultConfig.error = e.message
    }

    if (e instanceof ZodError) {
      defaultConfig.error = JSON.stringify(
        e.format(),
        (key, val) => (key === '_errors' && !val.length) ? undefined : val,
        ' ',
      )
    }
  }

  return defaultConfig
}

export async function getLocalConfig(): Promise<CompleteConfig | null> {
  const storage = useStorage('main')
  await storage.getKeys()

  return storage.getItem<CompleteConfig>('config')
}

/**
 * Safely retrieves a list of services for frontend.
 * Omit "secrets" fields.
 */
export function extractSafelyConfig(config: CompleteConfig) {
  return JSON.parse(JSON.stringify(
    config, (key, val) => key === 'secrets' ? undefined : val,
  ))
}

/**
 * Create Map services
 */
export function extractServicesFromConfig(config: CompleteConfig): Record<string, Service> {
  return config.services.reduce<Record<string, Service>>((acc, group) => {
    for (const item of group.items) {
      acc[item.id] = item
    }

    return acc
  }, {})
}
