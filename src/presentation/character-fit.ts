// Registration is in local rig pixels. Every worn layer consumes these same joints.
export interface BodyFit {scale:[number,number];shoulder:number;waist:number;hip:number;arm:number;thigh:number;calf:number}
export const BODY_FITS:Record<string,BodyFit>={
 slim:{scale:[.90,1],shoulder:26,waist:22,hip:12,arm:16,thigh:20,calf:17},
 balanced:{scale:[1,1],shoulder:29,waist:27,hip:13,arm:18,thigh:23,calf:20},
 broad:{scale:[1.12,1],shoulder:34,waist:25,hip:13,arm:21,thigh:24,calf:21},
 stocky:{scale:[1.14,.94],shoulder:31,waist:31,hip:15,arm:21,thigh:26,calf:22},
 tall:{scale:[.94,1.12],shoulder:28,waist:25,hip:13,arm:17,thigh:22,calf:19},
 compact:{scale:[.98,.86],shoulder:28,waist:27,hip:13,arm:18,thigh:23,calf:20},
 muscular:{scale:[1.14,1.04],shoulder:34,waist:28,hip:14,arm:23,thigh:26,calf:22},
 heavy:{scale:[1.25,1],shoulder:34,waist:35,hip:17,arm:23,thigh:28,calf:24},
};
export const TOP_SLEEVES:Record<string,'none'|'upper'|'full'>={tunic:'upper',shirt:'upper',vest:'upper',coat:'full',armor:'full',wrap:'upper',robe:'full',gambeson:'full',tank:'none',sweater:'full',doublet:'full',winter:'full'};
// Shoe soles share the ankle origin; shaft height varies with the actual footwear.
export const SHOE_HEIGHTS:Record<string,number>={boots:42,ankle:27,cloth:18,sandals:15,riding:46,wrapped:35,sabatons:34,'fur-boots':38};
// Crown registration is calibrated per hairstyle, shared by all head shapes.
// A face-hole heuristic is unreliable for asymmetric three-quarter ponytails.
export const HAIR_BOXES:Record<string,[number,number,number]>={
 crop:[74,52,-82],bob:[79,78,-80],long:[82,125,-80],ponytail:[78,115,-88],
 bun:[75,80,-92],mohawk:[72,73,-96],curly:[82,76,-80],braids:[80,124,-80],
 swept:[75,61,-80],'braided-bun':[80,78,-88],wavy:[84,124,-80],undercut:[76,65,-80],
};
