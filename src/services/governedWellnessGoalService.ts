export type WellnessGoalKind='steps'|'exercise_minutes'|'mindfulness_minutes'|'mind_sessions';
export type WellnessGoal={goal_kind:WellnessGoalKind;goal_value:string|number;status:string;approved:boolean;effective_from:string;revision:number;source:'USER'|'CONSULTANT'};
export const listWellnessGoals=async()=>{const {apiFetch}=await import('./apiClient');return apiFetch<{items:WellnessGoal[]}>('/v1/platform/wellness-goals');};
export const saveWellnessGoal=async(kind:WellnessGoalKind,value:number,effectiveFrom:string)=>{const {apiFetch}=await import('./apiClient');return apiFetch<WellnessGoal>(`/v1/platform/wellness-goals/${kind}`,{method:'PUT',body:JSON.stringify({value,effectiveFrom}),retryPolicy:'idempotent',idempotencyKey:`goal:${kind}:${effectiveFrom}:${value}`});};
