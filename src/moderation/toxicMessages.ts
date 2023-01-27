import toxicity from '@tensorflow-models/toxicity';
import { BaseModule } from '../BaseModule.js';
import { RecipleClient } from 'reciple';
import utility from '../utils/utility.js';

export interface ToxicMessagesConfig {
    predictionThreshold: number;
    ignoredToxicityLabels: (keyof typeof ToxicMessageLabel)[];
}

export enum ToxicMessageLabel {
    IdentityAttack = 'identity_attack',
    Insult = 'insult',
    Obscene = 'obscene',
    SevereToxicity = 'severe_toxicity',
    SexualExplicit = 'sexual_explicit',
    Threat = 'threat',
    Toxicity = 'toxicity'
}

export type ToxicMessageLabelValues = 'identity_attack'|'insult'|'obscene'|'severe_toxicity'|'sexual_explicit'|'threat'|'toxicity';

export interface MessageToxicity {
    isToxic: boolean;
    ignoredLabels: ToxicMessageLabel[];
    matches: {
        identity_attack: boolean;
        insult: boolean;
        obscene: boolean;
        severe_toxicity: boolean;
        sexual_explicit: boolean;
        threat: boolean;
        toxicity: boolean;
    };
}

export class ToxicMessagesModule extends BaseModule {
    public model!: toxicity.ToxicityClassifier;

    get config() { return utility.config.toxicMessages; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.model = await toxicity.load(this.config.predictionThreshold, []);

        return true;
    }

    public async isToxic(content: string): Promise<MessageToxicity> {
        const response = await this.model.classify(content);
        const isToxic = response.some(c => !this.config.ignoredToxicityLabels.includes(this.getLabel(c.label as ToxicMessageLabelValues)) && c.results.some(r => !!r.match))

        return {
            isToxic,
            ignoredLabels: this.config.ignoredToxicityLabels.map(l => this.getLabel(l)),
            matches: {
                identity_attack: this.getResult('identity_attack', response),
                insult: this.getResult('insult', response),
                obscene: this.getResult('obscene', response),
                severe_toxicity: this.getResult('severe_toxicity', response),
                sexual_explicit: this.getResult('sexual_explicit', response),
                threat: this.getResult('threat', response),
                toxicity: this.getResult('toxicity', response),
            }
        };
    }

    public getLabel(label: keyof typeof ToxicMessageLabel): ToxicMessageLabel;
    public getLabel(label: ToxicMessageLabelValues): keyof typeof ToxicMessageLabel;
    public getLabel(label: string): string {
        return ToxicMessageLabel[label as keyof typeof ToxicMessageLabel];
    }

    private getResult(label: ToxicMessageLabelValues, result: { label: string; results: { match: boolean|null; }[] }[]): boolean {
        return result.some(r => r.label === label && r.results.some(i => i.match));
    }
}

export default new ToxicMessagesModule();