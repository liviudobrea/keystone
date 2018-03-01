var	_ = require('lodash');
var	evalDependsOn = require('../../../../fields/utils/evalDependsOn');

function fireAction (item, customAction, req, res) {
	req.item = item;
	try {
		if (!evalDependsOn(customAction.dependsOn, item)) {
			throw new Error();
		}
		customAction.action.call(req.list, req, res, () => {
			if (customAction.save.post) {
				req.list.updateItem(req.item, item, req.body, { files: req.files, user: req.user }, function (err) {
					if (err) {
						var status = err.error === 'validation errors' ? 400 : 500;
						var error = err.error === 'database error' ? err.detail : err;
						return res.apiError(status, error);
					}
					// Reload the item from the database to prevent save hooks or other
					// application specific logic from messing with the values in the item
					req.list.model.findById(req.params.id, function (err, item) {
						res.json(req.list.getData(item));
					});
				});
			} else {
				res.json(req.list.getData(req.item));
			}
		});
	} catch (e) {
		if (!e.message) {
			e.message = `There was a problem performing the action "${customAction.name}"`;
		}
		res.status(500).json({ err: e.message, id: req.params.id, customAction: customAction.slug });
	}
}

function updateItem (item, req, res, cb) {

	req.list.updateItem(item, req.body, { files: req.files, user: req.user }, function (err) {
		if (err) {
			var status = err.error === 'validation errors' ? 400 : 500;
			var error = err.error === 'database error' ? err.detail : err;
			return res.apiError(status, error);
		}
		// Reload the item from the database to prevent save hooks or other
		// application specific logic from messing with the values in the item
		req.list.model.findById(req.params.id, function (err, updatedItem) {
			cb(req.list.getData(updatedItem));
		});
	});
}

module.exports = function (req, res) {
	var keystone = req.keystone;
	if (!keystone.security.csrf.validate(req)) return res.apiError(403, 'invalid csrf');
	var customAction = _.find(req.list._customActions, { slug: req.params.customAction });
	if (!customAction) return res.status(404).json({ err: 'not found', customAction: req.params.customAction });

	req.list.model.findById(req.params.id, function (err, item) {
		if (err) return res.status(500).json({ error: 'database error', detail: err });
		if (!item) return res.status(404).json({ err: 'not found', id: req.params.id });

		if (customAction.save.pre) {
			updateItem(item, req, res, function (updatedItem) {
				fireAction(updatedItem, customAction, req, res);
			});
		} else {
			fireAction(item, customAction, req, res);
		}
	});
};
