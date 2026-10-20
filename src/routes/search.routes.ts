/**
 * Search routes (v1).
 *
 * @openapi
 * /api/v1/search:
 *   get:
 *     summary: Full-text search across published artworks
 *     description: >-
 *       Uses Postgres `to_tsvector`/`ts_rank` computed against title and
 *       description. Empty or missing `q` returns recent results instead
 *       of an empty page. Results use page/limit pagination. Only artworks are searched — matching against
 *       artist name/username or tags is a documented follow-up, not
 *       implemented here.
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string, maxLength: 200 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [ART, ILLUSTRATION, GRAPHIC_DESIGN, PHOTOGRAPHY, DIGITAL_PAINTING, THREE_D_ART, ANIMATION, UX_UI, MUSIC, WRITING, OTHER] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Page of ranked search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, enum: [true] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items: { type: array, items: { type: object } }
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     total: { type: integer, example: 42, description: Total matches across all pages }
 *                     hasNext: { type: boolean, description: Whether another page follows this one }
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */

import { getSearch } from '@/controllers';
import { validate } from '@/middlewares';
import { searchQuerySchema } from '@/validators';

import { createFeatureRouter } from './router-factory';

export const searchRouter = createFeatureRouter('search');

searchRouter.get('/', validate({ query: searchQuerySchema }), getSearch);
