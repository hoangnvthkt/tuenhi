import { authorizeOwner } from '../_shared/authorize-owner.ts';
import { reactivateEmployeeHandler } from './handler.ts';

Deno.serve(reactivateEmployeeHandler(authorizeOwner));
