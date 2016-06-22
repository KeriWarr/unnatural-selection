import _ from 'lodash';
import csvWriter from  'csv-write-stream';
import fs from 'fs';


const WORLD_SIZE = 5;
const GERMINATION_TIME = 5;
const INITIAL_HEIGHT = 8;
const INITIAL_WIDTH = 3;
const INITIAL_LIFESPAN = 10;
const INITIAL_SHADE_TOLERANCE = 25; // out of 100

const MUTATION_FACTOR = 0.5;

const scoreHeight = height => Math.log2(height);
const scoreWidth = width => Math.log(width)/Math.log(1.6);
const scoreLifeSpan = lifeSpan => Math.log(lifeSpan)/Math.log(3);
const scoreShadeTolerance = shadeTolerance => shadeTolerance/10;

const invScoreHeight = height => Math.pow(2, height);
const invScoreWidth = width => Math.pow(1.6, width);
const invScoreLifeSpan = lifeSpan => Math.pow(3, lifeSpan);
const invScoreShadeTolerance = shadeTolerance => shadeTolerance * 10;

const ATTRIBUTE_INDICES = {
  0: 'height',
  1: 'width',
  2: 'lifeSpan',
  3: 'shadeTolerance',
}

const SCORE_FN_INDICES = {
  0: scoreHeight,
  1: scoreWidth,
  2: scoreLifeSpan,
  3: scoreShadeTolerance,
};

const INV_SCORE_FN_INDICES = {
  0: invScoreHeight,
  1: invScoreWidth,
  2: invScoreLifeSpan,
  3: invScoreShadeTolerance,
};

/*
 * plants need to collect this much light per surface area in order to send out
 * seeds. Surface units that are not collecting sunlight instead collect
 * SHADE_TOLERANCE/100 units of sunlight.
 */
const LIGHT_FOR_SEEDS_COEFFICIENT = 2.5;
const NUM_SEEDS = 4;

const STATUS_LIST = [
  'seed',
  'germinating',
  'seeding'
];

const initialPlant = {
  status: 'seeding',
  height: INITIAL_HEIGHT,
  width: INITIAL_WIDTH,
  age: 0,
  lifeSpan: INITIAL_LIFESPAN,
  shadeTolerance: INITIAL_SHADE_TOLERANCE,
  sunlight: 0,
};

/*
 * Note: if multiple seeds land on the same tile, one will be randomly selected.
 */

let initialWorld = _.range(WORLD_SIZE)
  .map(()=>_.range(WORLD_SIZE).map(()=>[]));

const middleIndex = Math.floor(WORLD_SIZE/2);
initialWorld[middleIndex][middleIndex] = [initialPlant];

/*
 * Phases of the tick function:
 * germinating plants become seeding
 * sunlight is colleced
 * seeds are spread
 * seeds are germinated
 * plats are killed
 */

/* AAAAAAAAA these functions should be pure!!!!! */

function sunlightToSeed(plant) {
  return (plant.width * plant.width) * 2 * LIGHT_FOR_SEEDS_COEFFICIENT;
}

function applyToAllPlants(world, func) {
  return _.map(world, row => _.map(row, func));
}

function makePlantsSeeding(world) {
  return applyToAllPlants(world, plants => {
    const plant = plants[0];
    if (plant && plant.status == 'germinating' && plant.age >= GERMINATION_TIME) {
      return [Object.assign({}, plant, {
        age: 0,
        status: 'seeding',
      })];
    }
    if (plant) {
      return [plant];
    }
    return [];
  });
}

function collectSunlight(world) {
  let canopy = _.range(WORLD_SIZE)
    .map(()=>_.range(WORLD_SIZE).map(()=>[]));

  for (var i = 0; i < WORLD_SIZE; i++) {
    for (var j = 0; j < WORLD_SIZE; j++) {
      const plant = world[i][j][0];
      if (plant) {
        for (var k = (-1 * plant.width) + 1; k < plant.width; k++) {
          for (var l = (-1 * plant.width) + 1; l < plant.width; l++) {
            if ((Math.abs(k) + Math.abs(l)) >= plant.width) continue;
            const x = i + k;
            const y = j + l;
            if (x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE) {
              canopy[x][y].push({ x: i, y: j, height: plant.height });
            }
          }
        }
      }
    }
  }

  for (var x = 0; x < WORLD_SIZE; x++) {
    for (var y = 0; y < WORLD_SIZE; y++) {
      if (canopy[x][y].length > 0) {
        const topPlant = _.sortBy(canopy[x][y], leaf => -1 * leaf.height)[0];
        world[topPlant.x][topPlant.y][0].sunlight += 1;
      }
    }
  }

  return world;
}

function spreadSeeds(world) {
  for (var i = 0; i < WORLD_SIZE; i++) {
    for (var j = 0; j < WORLD_SIZE; j++) {
      const plants = world[i][j];
      let plantIndex = _.findIndex(
        plants,
        plant => plant.status !== 'seed'
      );
      if (plantIndex >= 0) {
        const plant = world[i][j][plantIndex];
        const neededSunlight = sunlightToSeed(plant);
        if (plant.status == 'seeding' && plant.sunlight >= neededSunlight) {
          world[i][j][plantIndex] = Object.assign({}, plant, {
            sunlight: plant.sunlight - neededSunlight,
          });

          _.times(NUM_SEEDS, () => {
            const x = i + _.random(-1 * plant.width, plant.width);
            const y = j + _.random(-1 * plant.width, plant.width);

            if (x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE) {
              world[x][y].push(Object.assign({}, plant, {
                status: 'seed',
                age: 0,
                sunlight: 0,
              }));
            }
          });
        }
      }
    }
  }

  return world;
}

function filterSeeds(world) {
  return applyToAllPlants(world, plants => {
    if (plants.length === 0) {
      return plants;
    }

    const plant = _.find(
      plants,
      plant => plant.status !== 'seed'
    );

    if (plant) {
      return [plant];
    }

    return [plants[_.random(0,plants.length - 1)]];
  });
}

function mutateSeed(seed) {
  const fromIndex = _.random(0,3);
  const toInitialIndex = _.random(0,2);
  const toIndex = toInitialIndex +
    ((toInitialIndex >= fromIndex) ? 1 : 0);

  const fromAttribute = ATTRIBUTE_INDICES[fromIndex];
  const toAttribute = ATTRIBUTE_INDICES[toIndex];

  const fromScoreFn = SCORE_FN_INDICES[fromIndex];
  const toScoreFn = SCORE_FN_INDICES[toIndex];

  const fromInvScoreFn = INV_SCORE_FN_INDICES[fromIndex];
  const toInvScoreFn = INV_SCORE_FN_INDICES[toIndex];

  const fromValue = seed[fromAttribute];
  const toValue = seed[toAttribute];

  return Object.assign({}, seed, {
    [fromAttribute]: Math.round(fromInvScoreFn(toScoreFn(fromValue) - MUTATION_FACTOR)),
    [toAttribute]: Math.round(toInvScoreFn(toScoreFn(toValue) + MUTATION_FACTOR)),
  })
}

function mutateSeeds(world) {
  return applyToAllPlants(world, plants => {
    return _.map(plants, plant => {
      if (plant.status === 'seed') {
        const newPlant = mutateSeed(plant);
        return newPlant;
      }
      return plant;
    });
  });
}

function germinateSeeds(world) {
  return applyToAllPlants(world, plants => {
    let plant = plants[0];
    if (plant) {
      if (plant.status === 'seed') {
        plant = Object.assign({}, plant, {
          status: 'germinating',
        });
      }
      return [plant];
    }
    return [];
  });
}

function agePlants(world) {
  return applyToAllPlants(world, plants => {
    let plant = plants[0];
    if (plant) {
      return [Object.assign({}, plant, {
        age: plant.age + 1,
      })];
    }
    return [];
  });
}

function killOldPlants(world) {
  return applyToAllPlants(world, plants => {
    let plant = plants[0];
    if (plant) {
      if (plant.age >= plant.lifeSpan) {
        return [];
      }
      return [plant];
    }
    return [];
  });
}

const wrapFlow = (funcs, func) => _.flow(
  _.flatten(_.map(funcs, f => [func, f]))
);

const tick = wrapFlow([
  makePlantsSeeding,
  collectSunlight,
  spreadSeeds,
  filterSeeds,
  mutateSeeds,
  germinateSeeds,
  agePlants,
  killOldPlants,
], world => {
  // console.log(world[2][2]);
  return world;
});



function mapWorldToPlantList(world) {
  /*
   * TODO: make sure that the ordering of the fields is deterministic.
   * maybe enforce a particular ordering.
   */
  function mapPlantToString(plant) {
    const subPlant = _.pick(plant,
      ['height', 'width', 'lifeSpan', 'shadeTolerance']
    );
    return _.join(_.values(subPlant), '/');
  }

  const plantsList = _.filter(_.flattenDeep(world));

  return _.zipObject(
    /* FIXME: this constant is a hack */
    _.range(WORLD_SIZE*WORLD_SIZE),
    _.map(plantsList, mapPlantToString)
  );
}



const NUM_ITERATIONS = 1000;

function iterateAndWriteCSV(world) {
  const csvWriterOptions = {
    sendHeaders: false
  };

  const writer = csvWriter(csvWriterOptions);
  writer.pipe(fs.createWriteStream('history.csv'));

  _.times(NUM_ITERATIONS, () => {
    world = tick(world);
    writer.write(mapWorldToPlantList(world));
  });

  writer.end();
}


iterateAndWriteCSV(initialWorld);
