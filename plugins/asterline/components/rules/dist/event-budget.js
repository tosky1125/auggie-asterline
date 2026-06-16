export function withDynamicBudget(config) {
    return {
        ...config,
        maxRuleChars: Math.min(config.maxRuleChars, config.dynamicMaxRuleChars),
        maxResultChars: Math.min(config.maxResultChars, config.dynamicMaxResultChars),
    };
}
export function withPromptBudget(config) {
    return {
        ...config,
        maxRuleChars: Math.min(config.maxRuleChars, config.promptMaxRuleChars),
        maxResultChars: Math.min(config.maxResultChars, config.promptMaxResultChars),
    };
}
