import { v } from "convex/values"

import { query, mutation } from "./_generated/server"

// Category document validator
const categoryDocValidator = v.object({
  _id: v.id("categories"),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  icon: v.optional(v.string()),
  displayOrder: v.number(),
  isActive: v.boolean(),
})

/**
 * List all active categories ordered by display order
 */
export const list = query({
  args: {},
  returns: v.array(categoryDocValidator),
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_isActive_and_displayOrder", (q) => q.eq("isActive", true))
      .collect()

    return categories
  },
})

/**
 * List all categories (including inactive) for admin purposes
 */
export const listAll = query({
  args: {},
  returns: v.array(categoryDocValidator),
  handler: async (ctx) => {
    const categories = await ctx.db.query("categories").withIndex("by_displayOrder").collect()

    return categories
  },
})

/**
 * Get category by slug
 */
export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(categoryDocValidator, v.null()),
  handler: async (ctx, args) => {
    const category = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()

    return category
  },
})

/**
 * Get category by ID
 */
export const getById = query({
  args: { id: v.id("categories") },
  returns: v.union(categoryDocValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

/**
 * Seed initial categories (for setup)
 */
export const seed = mutation({
  args: {},
  returns: v.object({ message: v.string() }),
  handler: async (ctx) => {
    // Check if categories already exist
    const existing = await ctx.db.query("categories").first()
    if (existing) {
      return { message: "Categories already seeded" }
    }

    const defaultCategories = [
      { name: "Electronics", slug: "electronics", icon: "laptop", displayOrder: 1 },
      { name: "Textbooks", slug: "textbooks", icon: "book", displayOrder: 2 },
      { name: "Furniture", slug: "furniture", icon: "armchair", displayOrder: 3 },
      { name: "Clothing", slug: "clothing", icon: "tshirt", displayOrder: 4 },
      { name: "Dorm Essentials", slug: "dorm-essentials", icon: "bed", displayOrder: 5 },
      { name: "Sports & Outdoors", slug: "sports-outdoors", icon: "basketball", displayOrder: 6 },
      { name: "Tickets & Events", slug: "tickets-events", icon: "ticket", displayOrder: 7 },
      { name: "Free Stuff", slug: "free-stuff", icon: "gift", displayOrder: 8 },
      { name: "Services", slug: "services", icon: "wrench", displayOrder: 9 },
      { name: "Other", slug: "other", icon: "dots-three", displayOrder: 10 },
    ]

    for (const cat of defaultCategories) {
      await ctx.db.insert("categories", {
        ...cat,
        isActive: true,
      })
    }

    return { message: "Categories seeded successfully" }
  },
})

/**
 * Create a new category
 */
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    icon: v.optional(v.string()),
    displayOrder: v.number(),
    isActive: v.optional(v.boolean()),
  },
  returns: v.id("categories"),
  handler: async (ctx, args) => {
    // Check for duplicate slug
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()

    if (existing) {
      throw new Error(`Category with slug "${args.slug}" already exists`)
    }

    return await ctx.db.insert("categories", {
      name: args.name,
      slug: args.slug,
      icon: args.icon,
      displayOrder: args.displayOrder,
      isActive: args.isActive ?? true,
    })
  },
})

/**
 * Update a category
 */
export const update = mutation({
  args: {
    id: v.id("categories"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    icon: v.optional(v.string()),
    displayOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id)
    if (!category) {
      throw new Error("Category not found")
    }

    // Check for duplicate slug if slug is being changed
    if (args.slug && args.slug !== category.slug) {
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug!))
        .unique()

      if (existing) {
        throw new Error(`Category with slug "${args.slug}" already exists`)
      }
    }

    const updates: Record<string, unknown> = {}
    if (args.name !== undefined) updates.name = args.name
    if (args.slug !== undefined) updates.slug = args.slug
    if (args.icon !== undefined) updates.icon = args.icon
    if (args.displayOrder !== undefined) updates.displayOrder = args.displayOrder
    if (args.isActive !== undefined) updates.isActive = args.isActive

    await ctx.db.patch(args.id, updates)
    return null
  },
})

/**
 * Get category listing count (for displaying category cards)
 */
export const getListingCount = query({
  args: { category: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_category_and_status", (q) =>
        q.eq("category", args.category).eq("status", "active"),
      )
      .collect()

    return listings.length
  },
})
