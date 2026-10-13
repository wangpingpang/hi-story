import type { Command, ChoiceId } from '../contracts';
import type { View } from '../application/game';
/** The rendered snapshot is captured at binding time, never read afresh in an old callback. */
export function choiceCommand(view:View,choiceId:ChoiceId,commandId:string=crypto.randomUUID()):Command {return {commandId,runId:view.adventure.runId,actorId:view.character.actorId,eventInstanceId:view.eventInstanceId,revision:view.adventure.revision,choiceId};}
