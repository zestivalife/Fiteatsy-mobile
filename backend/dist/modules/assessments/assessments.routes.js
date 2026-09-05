import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { ASSESSMENT_TYPE_PSS10, assessmentResponseSchema, getAssessmentDefinition, normalizeAssessmentType } from './assessment-definitions.js';
import { completeAssessmentSession, createAssessmentSession, getAssessmentResultById, getAssessmentSession, getLatestAssessmentResult, getLatestDraftSession, listAssessmentResults, saveAssessmentResponses } from './assessments.repository.js';
export const assessmentsRouter = Router();
assessmentsRouter.use(requireAuthenticatedAccount);
const currentOwner = (req) => {
    const account = getAuthenticatedAccount(req);
    return { accountId: account.accountId, clientId: account.client.id };
};
const assessmentTypeParamSchema = z.object({
    assessmentType: z.string().min(1)
});
const responsePayloadSchema = z.object({
    responses: z.array(assessmentResponseSchema).min(1).max(10)
});
const toResultDto = (result) => result
    ? {
        id: result.id,
        sessionId: result.sessionId,
        assessmentType: result.assessmentType,
        instrumentVersion: result.instrumentVersion,
        scoringVersion: result.scoringVersion,
        interpretationVersion: result.interpretationVersion,
        interpretationKey: result.interpretationKey,
        interpretationLabel: result.interpretationLabel,
        rawScore: result.rawScore,
        maxScore: result.maxScore,
        completedAtISO: result.completedAtISO
    }
    : null;
const toSessionDto = (session) => ({
    id: session.id,
    assessmentType: session.assessmentType,
    instrumentVersion: session.instrumentVersion,
    scoringVersion: session.scoringVersion,
    status: session.status,
    startedAtISO: session.startedAtISO,
    completedAtISO: session.completedAtISO,
    responses: session.responses
});
assessmentsRouter.get('/:assessmentType/definition', (req, res) => {
    const parsed = assessmentTypeParamSchema.safeParse(req.params);
    const assessmentType = parsed.success ? normalizeAssessmentType(parsed.data.assessmentType) : null;
    if (!assessmentType) {
        return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND', message: 'Assessment definition not found.' });
    }
    const definition = getAssessmentDefinition(assessmentType);
    if (!definition?.active) {
        return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND', message: 'Assessment definition not found.' });
    }
    return res.status(200).json(definition);
});
assessmentsRouter.get('/:assessmentType/draft', async (req, res) => {
    const parsed = assessmentTypeParamSchema.safeParse(req.params);
    const assessmentType = parsed.success ? normalizeAssessmentType(parsed.data.assessmentType) : null;
    if (assessmentType !== ASSESSMENT_TYPE_PSS10) {
        return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND', message: 'Assessment definition not found.' });
    }
    const draft = await getLatestDraftSession(currentOwner(req));
    return res.status(200).json({ session: draft ? toSessionDto(draft) : null });
});
assessmentsRouter.post('/:assessmentType/sessions', async (req, res) => {
    const parsed = assessmentTypeParamSchema.safeParse(req.params);
    const assessmentType = parsed.success ? normalizeAssessmentType(parsed.data.assessmentType) : null;
    if (assessmentType !== ASSESSMENT_TYPE_PSS10) {
        return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND', message: 'Assessment definition not found.' });
    }
    const session = await createAssessmentSession(currentOwner(req));
    return res.status(201).json({ session: toSessionDto(session) });
});
assessmentsRouter.get('/sessions/:sessionId', async (req, res) => {
    const session = await getAssessmentSession(currentOwner(req), req.params.sessionId);
    if (!session) {
        return res.status(404).json({ error: 'ASSESSMENT_SESSION_NOT_FOUND', message: 'Assessment session not found.' });
    }
    return res.status(200).json({ session: toSessionDto(session) });
});
assessmentsRouter.put('/sessions/:sessionId/responses', async (req, res) => {
    const parsed = responsePayloadSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'INVALID_ASSESSMENT_RESPONSES', details: parsed.error.flatten() });
    }
    try {
        const session = await saveAssessmentResponses(currentOwner(req), req.params.sessionId, parsed.data.responses);
        if (!session) {
            return res.status(404).json({ error: 'ASSESSMENT_SESSION_NOT_FOUND', message: 'Assessment draft session not found.' });
        }
        return res.status(200).json({ session: toSessionDto(session) });
    }
    catch (error) {
        return res.status(400).json({
            error: 'INVALID_ASSESSMENT_RESPONSES',
            message: error instanceof Error ? error.message : 'Invalid assessment responses.'
        });
    }
});
assessmentsRouter.post('/sessions/:sessionId/complete', async (req, res) => {
    try {
        const completed = await completeAssessmentSession(currentOwner(req), req.params.sessionId);
        if (!completed) {
            return res.status(404).json({ error: 'ASSESSMENT_SESSION_NOT_FOUND', message: 'Assessment draft session not found.' });
        }
        return res.status(200).json({
            result: toResultDto(completed.result),
            previousResult: toResultDto(completed.previousResult)
        });
    }
    catch (error) {
        return res.status(409).json({
            error: 'ASSESSMENT_INCOMPLETE',
            message: error instanceof Error ? error.message : 'Assessment cannot be completed.'
        });
    }
});
assessmentsRouter.get('/:assessmentType/results/latest', async (req, res) => {
    const parsed = assessmentTypeParamSchema.safeParse(req.params);
    const assessmentType = parsed.success ? normalizeAssessmentType(parsed.data.assessmentType) : null;
    if (assessmentType !== ASSESSMENT_TYPE_PSS10) {
        return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND', message: 'Assessment definition not found.' });
    }
    const latest = await getLatestAssessmentResult(currentOwner(req));
    return res.status(200).json({
        result: toResultDto(latest.result),
        previousResult: toResultDto(latest.previousResult)
    });
});
assessmentsRouter.get('/:assessmentType/results', async (req, res) => {
    const parsed = assessmentTypeParamSchema.safeParse(req.params);
    const assessmentType = parsed.success ? normalizeAssessmentType(parsed.data.assessmentType) : null;
    if (assessmentType !== ASSESSMENT_TYPE_PSS10) {
        return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND', message: 'Assessment definition not found.' });
    }
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
    const results = await listAssessmentResults(currentOwner(req), limit);
    return res.status(200).json({ total: results.length, items: results.map(toResultDto) });
});
assessmentsRouter.get('/results/:resultId', async (req, res) => {
    const result = await getAssessmentResultById(currentOwner(req), req.params.resultId);
    if (!result) {
        return res.status(404).json({ error: 'ASSESSMENT_RESULT_NOT_FOUND', message: 'Assessment result not found.' });
    }
    return res.status(200).json({ result: toResultDto(result) });
});
