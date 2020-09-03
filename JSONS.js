// Returns if a value is an object
JSON.__proto__._isObject = function (value) {
	return value && typeof value === 'object' && value.constructor === Object;
}

JSON.__proto__._columnsFromStructure = function(structure, parent) {
	parent = parent || '';
	let columns = [];

	for (let k of Object.keys(structure)) {
		let columnName = [parent, k].filter(t => t.length > 0).join('_');

		if (JSON.__proto__._isObject(structure[k])) { // Sub model
			if (JSON.__proto__._modelFromStructure(structure[k]) == null) // Sub model is not a foreign model
				columns = columns.concat(JSON.__proto__._columnsFromStructure(structure[k], columnName).map(t => [parent, t].filter(t => t.length > 0).join('_')));
			else
				columns.push(columnName);
		} else { // Field
			columns.push(columnName);
		}
	}

	return columns;
}

JSON.__proto__._modelFromStructure = function(structure) {
	let model = null;

	for (let m of JSON.__proto__.__models) {
		if (m.columns.join() == JSON.__proto__._columnsFromStructure(structure).filter(t => t != 'ID').join()) {
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


// Default model
//		ID
// Tracking (used for updates)
//		prevID
// Timestamps
//		createdAt
//		updatedAt
//		deletedAt (if soft delete enabled)

JSON.__proto__.__config = {
	useTracking: true,
	softDelete: true,
	useTimestamps: true
};
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
		JSON.__proto__.__DB[model.name][idx] = Object.assign(JSON.__proto__.__DB[model.name][idx], data);
		return data;
	},
	delete: function(model, id) {}
};

JSON.__proto__.model = function(name, structure) {
	name = name.toLowerCase().trim();
	structure = structure || {};

	// Get columns
	columns = JSON.__proto__._columnsFromStructure(structure) || [];

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
		structure: structure,
		columns: columns,
		foreigns: {}
	};

	JSON.__proto__.__connector.init(newModel);
	JSON.__proto__.__models.push(newModel);
}

JSON.__proto__.save = function(data, model) {
	if (!JSON.__proto__._isObject(data)) {
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

		if (JSON.__proto__._isObject(kVal)) {
			// Save nested model and replace with ID
			let nestedModel = JSON._modelFromStructure(kVal);
			if (nestedModel == null) {
				console.error('JSON.save: Cannot find any nested model matching the data structure.');
				return null;
			}

			if ('ID' in kVal) {
				let nestedLoadedModel = JSON.__proto__.loadWithID(nestedModel.name, kVal.ID);
				if (nestedLoadedModel == null) {
					console.error('JSON.save "' + model.name + '": An error occurred during nested model loading.');
					return null;
				}

				modelData[k] = 	nestedLoadedModel;
				dbData[k] = 	nestedLoadedModel.ID;
			} else {
				let nestedSavedModel = JSON.__proto__.save(kVal, nestedModel);
				if (nestedSavedModel == null) {
					console.error('JSON.save "' + model.name + '": An error occurred during nested model saving.');
					return null;
				}

				modelData[k] = 	nestedSavedModel;
				dbData[k] = 	nestedSavedModel.ID;
			}

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
		if (JSON.__proto__.__config.useTimestamps)
			dbData.updatedAt = Date.now();

		if (JSON.__proto__.__config.useTracking) {
			let actualData = JSON.__proto__.__connector.read(model, dbData.ID);

			let backupDbData = Object.assign({}, actualData);
			backupDbData.ID = null;
			let savedModelData = JSON.__proto__.__connector.create(model, backupDbData);

			dbData.prevID = savedModelData.ID;
		}

		JSON.__proto__.__connector.update(model, dbData);
	} else { // Create new model
		// Tracking enabled
		if (JSON.__proto__.__config.useTracking)
			dbData.prevID = null;

		// Use timestamps
		if (JSON.__proto__.__config.useTimestamps) {
			dbData.createdAt = Date.now();
			dbData.updatedAt = null;
			if (JSON.__proto__.__config.softDelete)
				dbData.deletedAt = null;
		}

		let savedModelData = JSON.__proto__.__connector.create(model, dbData);
		modelData.ID = savedModelData.ID;
	}

	// Return ID of model
	return modelData;
}

JSON.__proto__.loadWithExample = function(data, config) {
	config = config || {

	};

	if (!JSON.__proto__._isObject(data)) {
		console.error('JSON.loadWithExample: Argument data must be a object.');
		return null;
	}

	// Find model from structure
	model = model || JSON._modelFromStructure(data);
	if (model == null) {
		console.error('JSON.loadWithExample: Cannot find any model matching the data structure.');
		return null;
	}

	return null;
}

JSON.__proto__.loadWithID = function(name, id, config) {
	config = config || {
		includeHistory: false
	}

	name = name.toLowerCase().trim();

	// Find model from name
	let model = JSON._modelFromName(name);

	if (model == null) {
		console.error('JSON.loadWithID: Cannot find any model.');
		return null;
	}

	// Read model data from DB
	let readModelData = JSON.__proto__.__connector.read(model, id);

	if (readModelData == null) {
		console.error('JSON.loadWithID: ID not found.');
		return null;	
	}

	// Model data to return
	let modelData = {};

	// Check for history
	if (config.includeHistory) {
		let history = [];

		var prevID = readModelData.prevID;
		while (prevID) {
			let prevReadModelData = JSON.__proto__.loadWithID(model.name, prevID);
			if (prevReadModelData == null) {
				console.error('JSON.loadWithID: Previous ID not found.');
				return null;	
			}

			history.push(prevReadModelData);
			prevID = prevReadModelData.prevID;
		}

		modelData._history = history;
	}

	// Check for nested models
	for (let k of Object.keys(readModelData)) {
		let kVal = readModelData[k];

		if (k in model.foreigns) // Columns is nested model
			modelData[k] = JSON.__proto__.loadWithID(model.foreigns[k], kVal, config);
		else
			modelData[k] = kVal;
	}

	return modelData;
}

/// TESTING ///

JSON.model('book', { name: '', author: '' })
JSON.model('user', { name: '', surname: '' })

JSON.model('test', {
	item: '',
	group: {
		name: '',
		role: ''
	}
})

var book_1 = JSON.save({
	name: 'Guida galattica per autostoppisti',
	author: {
		name: 'Michele',
		surname: 'Trombetta'
	}
})
console.log(book_1);

user = book_1.author;

JSON.save({
	item: 'Boh',
	group: {
		name: 'michele',
		role: 'admin'
	}
})

var book_2 = JSON.save({
	name: 'Boh',
	author: user
})
console.log(book_2);

user.name = 'Pippo';
JSON.save(user);

user.name = 'Helloworld';
JSON.save(user);

var newUser = JSON.save({
	name: "Alien",
	surname: "Logic"
});

book_1.author = newUser;
JSON.save(book_1);

console.log(JSON.stringify(JSON.loadWithID('book', 1, { includeHistory: true }), null, 2));

console.log("--- DEBUG ---")
//console.log(JSON.__proto__.__models);
console.log(JSON.__proto__.__models);
console.log(JSON.__proto__.__DB);
