import {test} from 'node:test';
import assert from 'node:assert/strict';
import {knownVehicleDetails} from '../lib/valentino-voice.mjs';

test('último vehículo no hereda año ni motor de otro modelo',()=>{
 const history=[{role:'cliente',text:'Tengo una Hilux 2020 motor 2.8'}];
 const v=knownVehicleDetails('Ahora quiero consultar por una Corolla',history);
 assert.equal(v.model.toLowerCase(),'corolla');
 assert.equal(v.year,'');
 assert.equal(v.engine,'');
 assert.equal(v.hasEngine,false);
});
test('respuestas posteriores completan datos del mismo vehículo',()=>{
 const history=[{role:'cliente',text:'Tengo una Hilux 2020'}];
 const v=knownVehicleDetails('Es motor 2.8',history);
 assert.equal(v.model.toLowerCase(),'hilux');
 assert.equal(v.year,'2020');
 assert.equal(v.engine,'2.8');
});
test('cambio de marca sin modelo descarta los datos anteriores',()=>{
 const history=[{role:'cliente',text:'Toyota Hilux 2020 motor 2.8'}];
 const v=knownVehicleDetails('No, es una Suzuki',history);
 assert.equal(v.brand.toLowerCase(),'suzuki');
 assert.equal(v.model,'');
 assert.equal(v.year,'');
});
