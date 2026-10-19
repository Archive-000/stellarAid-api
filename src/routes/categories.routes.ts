/**
 * Category taxonomy routes (v1).
 *
 * @openapi
 * /api/v1/categories:
 *   get:
 *     summary: List all categories, with sub-categories nested
 *     description: >
 *       Returns the category taxonomy as a tree. Each category includes its
 *       direct children. Results are cached for 5 minutes.
 *     tags: [Taxonomy]
 *     responses:
 *       200:
 *         description: Category tree
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CategoryTree'
 */

import { getCategories } from '@/controllers';

import { createFeatureRouter } from './router-factory';

export const categoriesRouter = createFeatureRouter('categories');

categoriesRouter.get('/', getCategories);
