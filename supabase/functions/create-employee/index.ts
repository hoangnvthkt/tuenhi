import { authorizeOwner } from '../_shared/authorize-owner.ts';
import { createEmployeeHandler } from './handler.ts';

Deno.serve(createEmployeeHandler(authorizeOwner));
