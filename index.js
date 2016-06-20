import _ from 'lodash';
import csvWriter from  'csv-write-stream';
import fs from 'fs';


const WORLD_SIZE = 40;
const GERMINATION_TIME = 5;
const INITIAL_HEIGHT = 8;
const INITIAL_WIDTH = 3;
const INITIAL_LIFESPAN = 20;
const INITIAL_SHADE_TOLERANCE = 50; // out of 100

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

function sunlightToSeed(plant) {
  return (plant.width * plant.width) * 2 * LIGHT_FOR_SEEDS_COEFFICIENT;
}

function applyToAllPlants(world, func) {
  return _.map(world, row => _.map(row, func));
}

function makePlantsSeeding(world) {
  return applyToAllPlants(world, plants => {
    let plant = plants[0];
    if (plant.status == 'germinating' && plant.age >= GERMINATION_TIME) {
      plant = Object.assign({}, plant, {
        age: 0,
        status: 'seeding',
      });
    }
    return [plant];
  });
}

function collectSunlight(world) {
  return world;
}

function spreadSeeds(world) {
  for (var i = 0; i < WORLD_SIZE; i++) {
    for (var j = 0; j < WORLD_SIZE; j++) {
      const plants = world[i][j];
      let plant = _.find(
        plants,
        plant => plant.status !== 'seed'
      );

      const neededSunlight = sunlightToSeed(plant);
      if (plant.status == 'seeding' && plant.sunlight >= neededSunlight) {
        plant = Object.assign({}, plant, {
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

function mutateSeeds(world) {
  return world;
}

function germinateSeeds(world) {
  return applyToAllPlants(world, plants => {
    let plant = plants[0];
    if (plant.status === 'seed') {
      plant = Object.assign({}, plant, {
        status: 'germinating',
      });
    }
    return [plant];
  });
}

function killOldPlants(world) {
  return applyToAllPlants(world, plants => {
    let plant = plants[0];
    if (plant.age >= plant.lifeSpan) {
      return [];
    }
    return [plant];
  });
}

const tick = _.flow([
  makePlantsSeeding,
  collectSunlight,
  spreadSeeds,
  filterSeeds,
  mutateSeeds,
  germinateSeeds,
  killOldPlants,
]);


function mapWorldToPlantList(world) {
  /*
   * TODO: make sure that the ordering of the fields is deterministic.
   * maybe enforce a particular ordering.
   */
  function mapPlantToString(plant) {
    const subPlant = _.pick(plant,
      ['height', 'width', 'lifeSpan', 'shadeTolerance']
    );
    return _.join(_.values(subPlant));
  }

  const plantsList = _.filter(_.flatten(world));

  return _.zipObject(
    _.range(plantsList.length),
    _.map(plantsList, mapPlantToString)
  );
}



const NUM_ITERATIONS = 20;

function iterateAndWriteCSV(world) {
  const csvWriterOptions = {
    separator: ';',
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
