import { Router } from 'express';

export const checkinsRouter = Router();

checkinsRouter.post('/', async (req, res) => {
  return res.status(201).json({
    status: 'stored',
    message: 'Check-in accepted. Intelligence pipeline can run asynchronously.'
  });
});
