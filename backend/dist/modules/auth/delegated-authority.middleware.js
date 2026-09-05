import { DelegatedAuthorityError, verifyDelegatedAuthority } from './delegated-authority.js';
export const requireDelegatedAuthority = (permission, purpose, actorType) => async (req, res, next) => {
    const token = req.header('x-zestiva-delegation');
    if (!token)
        return res.status(401).json({ error: 'DELEGATED_AUTHORITY_REQUIRED', message: 'Delegated authority is required.' });
    try {
        const authority = await verifyDelegatedAuthority(token, permission, purpose);
        if (actorType && authority.actor_type !== actorType) {
            return res.status(401).json({ error: 'INVALID_DELEGATED_ACTOR', message: 'Delegated authority is invalid.' });
        }
        req.delegatedAuthority = authority;
        return next();
    }
    catch (error) {
        const delegatedError = error instanceof DelegatedAuthorityError ? error : null;
        return res.status(401).json({ error: delegatedError?.code ?? 'INVALID_DELEGATED_AUTHORITY', message: 'Delegated authority is invalid.' });
    }
};
