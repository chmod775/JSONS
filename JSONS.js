// Returns if a value is an object
function isObject(value) {
	return value && typeof value === 'object' && value.constructor === Object;
}

JSON.__proto__._modelFromStructure = function(structure) {
	let model = null;

	for (let m of JSON.__proto__.__models) {
		if (m.columns.join() == Object.keys(structure).filter(t => t != 'ID').join()) {
			model = m;
			break;
		}
	}
	return model;
}
JSON.__proto__._modelFromName = function(name) {
	let model = null;
	for (let m of JSON.__proto__.__models) {
		if (m.name == name) {
			model = m;
			break;
		}
	}
	return model;
}


JSON.__proto__.__DB = {};

JSON.__proto__.__models = [];
JSON.__proto__.__connector = {
	init: function(model) {
		JSON.__proto__.__DB[model.name] = [];
	},
	create: function(model, data) {
		let ID = JSON.__proto__.__DB[model.name].length + 1;
		data['ID'] = ID;
		JSON.__proto__.__DB[model.name].push(data);
		return data;
	},
	read: function(model, id) {
		return JSON.__proto__.__DB[model.name].filter(t => t.ID == id)[0] || null;
	},
	select: function(model, filter) {},
	update: function(model, data) {
		if (!('ID' in data))
			return null;
		let idx = JSON.__proto__.__DB[model.name].findIndex(t => t.ID == data.ID);
		if (idx < 0)
			return null;
		JSON.__proto__.__DB[model.name][idx] = data;
		return data;
	},
	delete: function(model, id) {}
};

JSON.__proto__.model = function(name, columns) {
	name = name.toLowerCase().trim();
	columns = columns || [];

	// ERROR: Cannot create a model with empty name
	if (name.length == 0) {
		console.error('JSON.model: Cannot create a model with empty name');
		return;
	}

	// ERROR: Cannot create a model with no columns
	if (columns.length == 0) {
		console.error('JSON.model "' + name + '": Cannot create a model with no columns');
		return;
	}

	// Check if model already exists
	var sameName = false;
	var sameColumns = false;

	for (let m of JSON.__proto__.__models) {
		// ERROR: A model with the same name already exists
		if (m.name == name) {
			console.error('JSON.model "' + name + '": Model name already used.');
			return;
		}

		// ERROR: Model already exists
		if (m.columns.join() == columns.join()) {
			console.error('JSON.model "' + name + '": A model with the same structure already exists.');
			return;
		}
	}

	// Create model
	let newModel = {
		name: name,
		columns: columns,
		foreigns: {}
	};

	JSON.__proto__.__connector.init(newModel);
	JSON.__proto__.__models.push(newModel);
}

JSON.__proto__.save = function(data, model) {
	if (!isObject(data)) {
		console.error('JSON.save: Argument data must be a object.');
		return null;
	}

	// Find model from structure
	model = model || JSON._modelFromStructure(data);
	if (model == null) {
		console.error('JSON.save: Cannot find any model matching the data structure.');
		return null;
	}

	// Prepare model data
	let modelData = {};

	// Prepare db raw data
	let dbData = {};
	for (let k of Object.keys(data)) {
		let kVal = data[k];

		if (isObject(kVal)) {
			// Save nested model and replace with ID
			let nestedModel = JSON._modelFromStructure(kVal);
			if (nestedModel == null) {
				console.error('JSON.save: Cannot find any nested model matching the data structure.');
				return null;
			}

			let nestedSavedModel = JSON.__proto__.save(kVal, nestedModel);
			if (nestedSavedModel == null) {
				console.error('JSON.save "' + model.name + '": An error occurred during nested model saving.');
				return null;
			}

			modelData[k] = 	nestedSavedModel;
			dbData[k] = 	nestedSavedModel.ID;				

			// Keep track of foreigns columns
			if (k in model.foreigns)
				if (model.foreigns[k] != nestedModel.name) {
					console.error('JSON.save "' + model.name + '": Foreign model does not match column.');
					return null;
				}
			model.foreigns[k] = nestedModel.name;
		} else if (Array.isArray(kVal)) {
			// Check for arrays and throw error
			console.error('JSON.save: Array is not allowed as data.');
			return null;
		} else {
			// Add to model data
			modelData[k] = 	kVal;
			dbData[k] = 	kVal;
		}
	}

	// Save model to DB
	if ('ID' in data) { // Update model
		let savedModelData = JSON.__proto__.__connector.update(model, dbData);
	} else { // Create new model
		let savedModelData = JSON.__proto__.__connector.create(model, dbData);
		modelData.ID = savedModelData.ID;
	}

	// Return ID of model
	return modelData;
}

JSON.__proto__.load = function(name, id) {
	name = name.toLowerCase().trim();

	// Find model from name
	let model = JSON._modelFromName(name);

	if (model == null) {
		console.error('JSON.load: Cannot find any model.');
		return null;
	}

	// Read model data from DB
	let readModelData = JSON.__proto__.__connector.read(model, id);

	if (readModelData == null) {
		console.error('JSON.load: ID not found.');
		return null;	
	}

	// Check for nested models
	let modelData = {};
	for (let k of Object.keys(readModelData)) {
		let kVal = readModelData[k];

		if (k in model.foreigns) { // Columns is nested model
			modelData[k] = JSON.__proto__.load(model.foreigns[k], kVal);
		} else {
			modelData[k] = kVal;
		}

		if (k.includes('___')) { 
			let kSplit = k.split('___');
			if (kSplit.length != 2) {
				console.error('JSON.load: Error in nested model columns format.');
				return null;
			}
			modelData[kSplit[1]] = JSON.__proto__.load(kSplit[0], kVal);
		} else {
		}
	}

	return modelData;
}

JSON.model('book', ['name', 'author'])
JSON.model('user', ['name', 'surname'])



var book_1 = JSON.save({
	name: 'Guida galattica per autostoppisti',
	author: {
		name: 'Michele',
		surname: 'Trombetta'
	}
})
console.log(book_1);

user = book_1.author;

var book_2 = JSON.save({
	name: 'Boh',
	author: user
})
console.log(book_2);

user.name = 'Pippo';
JSON.save(user);

console.log(JSON.load('book', 1));

//console.log(JSON.__proto__.__models);
console.log(JSON.__proto__.__DB);
