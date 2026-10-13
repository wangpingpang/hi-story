import { initializeStory, processPlayerAction, receiveWorldChange, storyOptions, type World, type Change } from '../modules/story-planning';
export class StoryStudio {
 private world:World;
 constructor(seed:string){this.world=initializeStory(seed);}
 query(){return {world:structuredClone(this.world),options:storyOptions(this.world)};}
 restart(seed:string,background?:{text:string;tags:string[]}){this.world=initializeStory(seed,background);}
 act(optionId:string){const result=processPlayerAction(this.world,{id:`action-${this.world.revision}-${optionId}`,revision:this.world.revision,optionId});this.world=result.world;return result.request;}
 change(id:string,change:Change){this.world=receiveWorldChange(this.world,id,change);}
}
